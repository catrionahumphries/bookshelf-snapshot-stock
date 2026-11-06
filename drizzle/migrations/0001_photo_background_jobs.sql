CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE TABLE public.photo_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 image text NOT NULL, sku text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','paused')),
 callback_token uuid NOT NULL DEFAULT gen_random_uuid(),
 callback_url text NOT NULL,
 lease_until timestamptz, result_count integer NOT NULL DEFAULT 0,
 error_message text NOT NULL DEFAULT '', pause_kind text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
GRANT ALL ON public.photo_jobs TO service_role;
GRANT SELECT(id,user_id,sku,status,result_count,error_message,pause_kind,created_at,completed_at,lease_until) ON public.photo_jobs TO authenticated;
ALTER TABLE public.photo_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY photo_jobs_owner_read ON public.photo_jobs FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE INDEX photo_jobs_owner_created ON public.photo_jobs(user_id,created_at DESC);
CREATE TABLE public.photo_queue_state (user_id uuid PRIMARY KEY, pause_kind text NOT NULL, reason text NOT NULL);
GRANT ALL ON public.photo_queue_state TO service_role;
GRANT SELECT ON public.photo_queue_state TO authenticated;
ALTER TABLE public.photo_queue_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY photo_queue_owner_read ON public.photo_queue_state FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION public.wake_photo_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='queued' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  PERFORM net.http_post(url:=NEW.callback_url, headers:=jsonb_build_object('Content-Type','application/json'), body:=jsonb_build_object('id',NEW.id,'token',NEW.callback_token), timeout_milliseconds:=300000);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.wake_photo_job() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER photo_job_wake AFTER INSERT OR UPDATE OF status ON public.photo_jobs FOR EACH ROW EXECUTE FUNCTION public.wake_photo_job();
CREATE FUNCTION public.enqueue_photo_job(p_id uuid,p_image text,p_sku text,p_preview boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF length(p_image)>8000000 OR p_image NOT LIKE 'data:image/%' OR length(p_sku)>100 THEN RAISE EXCEPTION 'Invalid photo or SKU'; END IF;
 INSERT INTO public.photo_jobs(id,user_id,image,sku,callback_url) VALUES(p_id,auth.uid(),p_image,p_sku,CASE WHEN p_preview THEN 'https://project--316c6658-d2a0-4b0d-bd2c-703d883184fb-dev.lovable.app/api/public/photo-worker' ELSE 'https://project--316c6658-d2a0-4b0d-bd2c-703d883184fb.lovable.app/api/public/photo-worker' END) ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.photo_jobs WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Invalid job'; END IF;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_photo_job(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enqueue_photo_job(uuid,text,text,boolean) TO authenticated;
CREATE FUNCTION public.verify_photo_callback(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.photo_jobs WHERE id=p_id AND callback_token=p_token AND status='queued') $$;
REVOKE ALL ON FUNCTION public.verify_photo_callback(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_photo_callback(uuid,uuid) TO anon,authenticated,service_role;
CREATE FUNCTION public.claim_photo_job(p_id uuid) RETURNS SETOF public.photo_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.photo_jobs SET status='processing',lease_until=now()+interval '15 minutes' WHERE id=p_id AND status='queued' RETURNING *
$$;
REVOKE ALL ON FUNCTION public.claim_photo_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_photo_job(uuid) TO service_role;
CREATE FUNCTION public.finish_photo_job(p_id uuid,p_books jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.photo_jobs; n integer;
BEGIN
 SELECT * INTO job FROM public.photo_jobs WHERE id=p_id FOR UPDATE;
 IF job.status IS DISTINCT FROM 'processing' THEN RETURN 0; END IF;
 INSERT INTO public.books(user_id,title,author,series_name,volume,sku,needs_review,review_note)
 SELECT job.user_id,coalesce(b->>'title',''),coalesce(b->>'author',''),coalesce(b->>'series_name',''),coalesce(b->>'volume',''),job.sku,coalesce((b->>'uncertain')::boolean,true),coalesce(b->>'note','') FROM jsonb_array_elements(p_books) b;
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.photo_jobs SET status='completed',result_count=n,completed_at=now(),image='',lease_until=NULL WHERE id=p_id;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.finish_photo_job(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_photo_job(uuid,jsonb) TO service_role;
CREATE FUNCTION public.retry_photo_job(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.photo_jobs;
BEGIN
 SELECT * INTO job FROM public.photo_jobs WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF job.id IS NULL THEN RAISE EXCEPTION 'Photo not found'; END IF;
 IF job.status NOT IN ('failed','paused') AND NOT(job.status='processing' AND job.lease_until<now()) AND NOT(job.status='queued' AND job.created_at<now()-interval '15 minutes') THEN RAISE EXCEPTION 'Photo is still processing'; END IF;
 DELETE FROM public.photo_queue_state WHERE user_id=auth.uid();
 UPDATE public.photo_jobs SET status='queued',callback_token=gen_random_uuid(),error_message='',pause_kind='',lease_until=NULL,created_at=now() WHERE id=p_id;
 -- Queued delivery recovery does not change status, so wake it explicitly.
 IF job.status='queued' THEN PERFORM net.http_post(url:=job.callback_url,headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('id',p_id,'token',(SELECT callback_token FROM public.photo_jobs WHERE id=p_id)),timeout_milliseconds:=300000); END IF;
END $$;
REVOKE ALL ON FUNCTION public.retry_photo_job(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_photo_job(uuid) TO authenticated;