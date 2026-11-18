ALTER TABLE public.books ADD COLUMN format text NOT NULL DEFAULT '';
ALTER TABLE public.photo_jobs ADD COLUMN format text NOT NULL DEFAULT '';
DROP FUNCTION public.enqueue_photo_job(uuid, text, text, boolean);
DROP FUNCTION public.enqueue_isbn_job(uuid, text, text);
CREATE FUNCTION public.enqueue_photo_job(p_id uuid, p_image text, p_sku text, p_preview boolean, p_format text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF length(p_image)>8000000 OR p_image NOT LIKE 'data:image/%' OR length(p_sku)>100 OR length(p_format)>40 THEN RAISE EXCEPTION 'Invalid photo or SKU'; END IF;
 DELETE FROM public.photo_queue_state WHERE user_id=auth.uid() AND pause_kind='refusal';
 INSERT INTO public.photo_jobs(id,user_id,image,sku,format,callback_url) VALUES(p_id,auth.uid(),p_image,p_sku,p_format,'https://bookshelf-snapshot-stock.lovable.app/api/public/photo-worker') ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.photo_jobs WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Invalid job'; END IF;
 RETURN p_id;
END $$;
CREATE FUNCTION public.enqueue_isbn_job(p_id uuid, p_isbn text, p_sku text, p_format text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_existing public.isbn_jobs; v_sum int:=0; v_i int;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 IF p_isbn !~ '^(978|979)[0-9]{10}$' OR length(p_sku)>100 OR length(p_format)>40 THEN RAISE EXCEPTION 'Invalid ISBN or SKU'; END IF;
 FOR v_i IN 1..13 LOOP v_sum:=v_sum+substring(p_isbn,v_i,1)::int*CASE WHEN v_i%2=0 THEN 3 ELSE 1 END; END LOOP;
 IF v_sum%10<>0 THEN RAISE EXCEPTION 'Invalid ISBN checksum'; END IF;
 SELECT * INTO v_existing FROM public.isbn_jobs WHERE id=p_id;
 IF FOUND THEN IF v_existing.user_id<>v_user THEN RAISE EXCEPTION 'Unauthorized'; END IF; RETURN v_existing.book_id; END IF;
 INSERT INTO public.books(id,user_id,isbn,sku,format,title,needs_review,review_note,lookup_status) VALUES(p_id,v_user,p_isbn,p_sku,p_format,'',true,'Looking up details…','queued');
 INSERT INTO public.isbn_jobs(id,user_id,book_id,isbn,callback_url) VALUES(p_id,v_user,p_id,p_isbn,'https://bookshelf-snapshot-stock.lovable.app/api/public/isbn-worker');
 RETURN p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.enqueue_photo_job(uuid,text,text,boolean,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_isbn_job(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_photo_job(uuid,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_isbn_job(uuid,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.finish_photo_job(p_id uuid, p_books jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.photo_jobs; n integer;
BEGIN
 SELECT * INTO job FROM public.photo_jobs WHERE id=p_id FOR UPDATE;
 IF job.status IS DISTINCT FROM 'processing' THEN RETURN 0; END IF;
 INSERT INTO public.books(user_id,title,author,series_name,volume,sku,format,needs_review,review_note)
 SELECT job.user_id,coalesce(b->>'title',''),coalesce(b->>'author',''),coalesce(b->>'series_name',''),coalesce(b->>'volume',''),job.sku,job.format,coalesce((b->>'uncertain')::boolean,true),coalesce(b->>'note','') FROM jsonb_array_elements(p_books) b;
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.photo_jobs SET status='completed',result_count=n,completed_at=now(),image='',lease_until=NULL WHERE id=p_id;
 RETURN n;
END $$;