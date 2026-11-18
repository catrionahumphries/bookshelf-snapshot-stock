ALTER TABLE public.books ADD COLUMN isbn text NOT NULL DEFAULT '', ADD COLUMN lookup_status text NOT NULL DEFAULT '';
CREATE TABLE public.isbn_jobs (id uuid PRIMARY KEY, user_id uuid NOT NULL, book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE, isbn text NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed')), callback_token uuid NOT NULL DEFAULT gen_random_uuid(), callback_url text NOT NULL, lease_until timestamptz, error_message text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT(id,book_id,isbn,status,lease_until,error_message,created_at,user_id) ON public.isbn_jobs TO authenticated;
GRANT ALL ON public.isbn_jobs TO service_role;
ALTER TABLE public.isbn_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read ISBN jobs" ON public.isbn_jobs FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE TRIGGER wake_isbn_job AFTER INSERT OR UPDATE OF status ON public.isbn_jobs FOR EACH ROW EXECUTE FUNCTION public.wake_photo_job();
CREATE FUNCTION public.enqueue_isbn_job(p_id uuid,p_isbn text,p_sku text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_existing public.isbn_jobs; v_sum int:=0; v_i int;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 IF p_isbn !~ '^(978|979)[0-9]{10}$' OR length(p_sku)>100 THEN RAISE EXCEPTION 'Invalid ISBN or SKU'; END IF;
 FOR v_i IN 1..13 LOOP v_sum:=v_sum+substring(p_isbn,v_i,1)::int*CASE WHEN v_i%2=0 THEN 3 ELSE 1 END; END LOOP;
 IF v_sum%10<>0 THEN RAISE EXCEPTION 'Invalid ISBN checksum'; END IF;
 SELECT * INTO v_existing FROM public.isbn_jobs WHERE id=p_id;
 IF FOUND THEN IF v_existing.user_id<>v_user THEN RAISE EXCEPTION 'Unauthorized'; END IF; RETURN v_existing.book_id; END IF;
 INSERT INTO public.books(id,user_id,isbn,sku,title,needs_review,review_note,lookup_status) VALUES(p_id,v_user,p_isbn,p_sku,'',true,'Looking up details…','queued');
 INSERT INTO public.isbn_jobs(id,user_id,book_id,isbn,callback_url) VALUES(p_id,v_user,p_id,p_isbn,'https://bookshelf-snapshot-stock.lovable.app/api/public/isbn-worker');
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_isbn_job(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enqueue_isbn_job(uuid,text,text) TO authenticated;
CREATE FUNCTION public.verify_isbn_callback(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.isbn_jobs WHERE id=p_id AND callback_token=p_token AND status='queued') $$;
REVOKE ALL ON FUNCTION public.verify_isbn_callback(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_isbn_callback(uuid,uuid) TO anon,authenticated,service_role;
CREATE FUNCTION public.claim_isbn_job(p_id uuid,p_token uuid) RETURNS SETOF public.isbn_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ UPDATE public.isbn_jobs SET status='processing',lease_until=now()+interval '3 minutes' WHERE id=p_id AND callback_token=p_token AND status='queued' RETURNING * $$;
REVOKE ALL ON FUNCTION public.claim_isbn_job(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_isbn_job(uuid,uuid) TO service_role;
CREATE FUNCTION public.finish_isbn_job(p_id uuid,p_token uuid,p_details jsonb,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.isbn_jobs;
BEGIN
 SELECT * INTO j FROM public.isbn_jobs WHERE id=p_id AND callback_token=p_token AND status='processing' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.books SET title=CASE WHEN p_error='' THEN coalesce(p_details->>'title','') ELSE title END,author=CASE WHEN p_error='' THEN coalesce(p_details->>'author','') ELSE author END,needs_review=true,review_note=CASE WHEN p_error='' THEN 'ISBN matched. Check series and volume if applicable.' ELSE p_error END,lookup_status=CASE WHEN p_error='' THEN 'completed' ELSE 'failed' END WHERE id=j.book_id;
 UPDATE public.isbn_jobs SET status=CASE WHEN p_error='' THEN 'completed' ELSE 'failed' END,error_message=p_error,lease_until=NULL WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.finish_isbn_job(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_isbn_job(uuid,uuid,jsonb,text) TO service_role;
CREATE FUNCTION public.retry_isbn_job(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.isbn_jobs SET status='queued',callback_token=gen_random_uuid(),lease_until=NULL,error_message='' WHERE id=p_id AND user_id=auth.uid() AND (status='failed' OR (status='processing' AND lease_until<now()) OR (status='queued' AND created_at<now()-interval '3 minutes'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Job not retryable'; END IF;
 UPDATE public.books SET lookup_status='queued',review_note='Looking up details…' WHERE id=p_id AND user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.retry_isbn_job(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_isbn_job(uuid) TO authenticated;