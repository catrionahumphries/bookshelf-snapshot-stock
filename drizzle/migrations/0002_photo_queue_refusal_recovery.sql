CREATE OR REPLACE FUNCTION public.enqueue_photo_job(p_id uuid,p_image text,p_sku text,p_preview boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF length(p_image)>8000000 OR p_image NOT LIKE 'data:image/%' OR length(p_sku)>100 THEN RAISE EXCEPTION 'Invalid photo or SKU'; END IF;
 -- A newly submitted photo is a fresh user action after a content refusal.
 DELETE FROM public.photo_queue_state WHERE user_id=auth.uid() AND pause_kind='refusal';
 INSERT INTO public.photo_jobs(id,user_id,image,sku,callback_url) VALUES(p_id,auth.uid(),p_image,p_sku,CASE WHEN p_preview THEN 'https://project--316c6658-d2a0-4b0d-bd2c-703d883184fb-dev.lovable.app/api/public/photo-worker' ELSE 'https://project--316c6658-d2a0-4b0d-bd2c-703d883184fb.lovable.app/api/public/photo-worker' END) ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.photo_jobs WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Invalid job'; END IF;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_photo_job(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enqueue_photo_job(uuid,text,text,boolean) TO authenticated;