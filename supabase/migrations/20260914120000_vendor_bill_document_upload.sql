alter table public.vendor_bills
  add column source_file_path text,
  add constraint vendor_bills_source_file_path_check check (
    source_file_path is null
    or source_file_path = company_id::text || '/vendor-bills/' || id::text || '/source.pdf'
  );

create or replace function public.attach_vendor_bill_document(
  p_id uuid,
  p_storage_path text,
  p_file_name text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid;
  v_expected_path text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select company_id into v_company_id
  from public.vendor_bills
  where id = p_id;

  if v_company_id is null then
    raise exception using errcode = 'P0002', message = 'VENDOR_BILL_NOT_FOUND';
  end if;
  if not public.has_company_role(v_company_id, array['OWNER','ADMIN','FINANCE']::public.company_role[]) then
    raise exception using errcode = '42501', message = 'FINANCE_ROLE_REQUIRED';
  end if;

  v_expected_path := v_company_id::text || '/vendor-bills/' || p_id::text || '/source.pdf';
  if p_storage_path <> v_expected_path then
    raise exception using errcode = '22023', message = 'INVALID_VENDOR_DOCUMENT_PATH';
  end if;
  if length(trim(p_file_name)) = 0 or length(p_file_name) > 255 or lower(p_file_name) not like '%.pdf' then
    raise exception using errcode = '22023', message = 'INVALID_VENDOR_DOCUMENT';
  end if;

  update public.vendor_bills
  set source_file_path = p_storage_path,
      source_file_name = trim(p_file_name)
  where id = p_id;

  insert into public.audit_logs(company_id, action, entity_type, entity_id, details)
  values (
    v_company_id,
    'VENDOR_DOCUMENT_ATTACHED',
    'vendor_bill',
    p_id,
    jsonb_build_object('fileName', trim(p_file_name), 'storagePath', p_storage_path)
  );
end;
$$;

revoke all on function public.attach_vendor_bill_document(uuid,text,text) from public;
grant execute on function public.attach_vendor_bill_document(uuid,text,text) to authenticated;

create policy vendor_documents_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'invoice-documents'
  and (storage.foldername(name))[2] = 'vendor-bills'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['OWNER','ADMIN','FINANCE']::public.company_role[]
  )
)
with check (
  bucket_id = 'invoice-documents'
  and (storage.foldername(name))[2] = 'vendor-bills'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['OWNER','ADMIN','FINANCE']::public.company_role[]
  )
);

create policy vendor_documents_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'invoice-documents'
  and (storage.foldername(name))[2] = 'vendor-bills'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['OWNER','ADMIN','FINANCE']::public.company_role[]
  )
);
