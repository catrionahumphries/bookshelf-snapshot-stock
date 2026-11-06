CREATE OR REPLACE FUNCTION public.enqueue_photo_job(p_id uuid,p_image text,p_sku text,p_preview boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF length(p_image)>8000000 OR p_image NOT LIKE 'data:image/%' OR length(p_sku)>100 THEN RAISE EXCEPTION 'Invalid photo or SKU'; END IF;
 DELETE FROM public.photo_queue_state WHERE user_id=auth.uid() AND pause_kind='refusal';
 INSERT INTO public.photo_jobs(id,user_id,image,sku,callback_url) VALUES(p_id,auth.uid(),p_image,p_sku,'https://bookshelf-snapshot-stock.lovable.app/api/public/photo-worker') ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.photo_jobs WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Invalid job'; END IF;
 RETURN p_id;
END $$;
CREATE OR REPLACE FUNCTION public.claim_photo_job(p_id uuid) RETURNS SETOF public.photo_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid;
BEGIN
 SELECT user_id INTO owner_id FROM public.photo_jobs WHERE id=p_id;
 IF owner_id IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 IF EXISTS(SELECT 1 FROM public.photo_jobs WHERE user_id=owner_id AND status='processing') THEN RETURN; END IF;
 RETURN QUERY UPDATE public.photo_jobs SET status='processing',lease_until=now()+interval '15 minutes' WHERE id=p_id AND status='queued' RETURNING *;
END $$;
CREATE FUNCTION public.wake_next_photo_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_job public.photo_jobs;
BEGIN
 IF OLD.status='processing' AND NEW.status IN ('completed','failed') THEN
  SELECT * INTO next_job FROM public.photo_jobs WHERE user_id=NEW.user_id AND status='queued' ORDER BY created_at LIMIT 1;
  IF next_job.id IS NOT NULL THEN
   PERFORM net.http_post(url:=next_job.callback_url,headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('id',next_job.id,'token',next_job.callback_token),timeout_milliseconds:=300000);
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.wake_next_photo_job() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER photo_job_next AFTER UPDATE OF status ON public.photo_jobs FOR EACH ROW EXECUTE FUNCTION public.wake_next_photo_job();
REVOKE ALL ON FUNCTION public.claim_photo_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_photo_job(uuid) TO service_role;