ALTER TABLE public.books ADD COLUMN source text NOT NULL DEFAULT '';
ALTER TABLE public.photo_jobs ADD COLUMN source text NOT NULL DEFAULT '';
CREATE FUNCTION public.enqueue_photo_with_source(p_id uuid, p_image text, p_sku text, p_preview boolean, p_format text, p_source text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF p_source IS NULL OR length(p_source)>2000 OR p_image IS NULL OR length(p_image)>8000000 OR p_image NOT LIKE 'data:image/%' OR length(p_sku)>100 OR length(p_format)>40 THEN RAISE EXCEPTION 'Invalid photo details'; END IF;
 DELETE FROM public.photo_queue_state WHERE user_id=auth.uid() AND pause_kind='refusal';
 INSERT INTO public.photo_jobs(id,user_id,image,sku,format,source,callback_url) VALUES(p_id,auth.uid(),p_image,p_sku,p_format,p_source,'https://bookshelf-snapshot-stock.lovable.app/api/public/photo-worker') ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.photo_jobs WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Invalid job'; END IF;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_photo_with_source(uuid,text,text,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enqueue_photo_with_source(uuid,text,text,boolean,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.finish_photo_job(p_id uuid, p_books jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.photo_jobs; n integer;
BEGIN
 SELECT * INTO job FROM public.photo_jobs WHERE id=p_id FOR UPDATE;
 IF job.status IS DISTINCT FROM 'processing' THEN RETURN 0; END IF;
 INSERT INTO public.books(user_id,title,author,series_name,volume,sku,format,source,needs_review,review_note)
 SELECT job.user_id,coalesce(b->>'title',''),coalesce(b->>'author',''),coalesce(b->>'series_name',''),coalesce(b->>'volume',''),job.sku,job.format,job.source,coalesce((b->>'uncertain')::boolean,true),coalesce(b->>'note','') FROM jsonb_array_elements(p_books) b;
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.photo_jobs SET status='completed',result_count=n,completed_at=now(),image='',lease_until=NULL WHERE id=p_id;
 RETURN n;
END $$;