-- 00068 · تنظيم إسناد مسؤولي الأقسام: قاطعان بلديان، وأربع مناطق لكل قاطع
-- يلغي الحد القديم (3 مناطق) ويسمح بإسناد أي مجموعة أو جميع المناطق الثماني.

alter table public.sectors
  add column if not exists parent_sector text;

update public.sectors
set name = case id
  when 1 then 'أرخيته'
  when 2 then 'الرياض'
  when 3 then 'الواثق'
  when 4 then 'الجادرية'
  when 5 then 'السندباد'
  when 6 then 'الزعفرانية'
  when 7 then 'ديالى'
  when 8 then 'الوليد'
end,
parent_sector = case when id between 1 and 4 then 'karrada' else 'zaafaraniya' end
where id between 1 and 8;

alter table public.sectors
  alter column parent_sector set not null;

alter table public.sectors
  drop constraint if exists sectors_parent_sector_check;
alter table public.sectors
  add constraint sectors_parent_sector_check
  check (parent_sector in ('karrada', 'zaafaraniya'));

alter table public.manager_profiles
  drop constraint if exists manager_sectors_count;
alter table public.manager_profiles
  add constraint manager_sectors_count check (
    cardinality(sectors) between 1 and 8
    and sectors <@ array[1,2,3,4,5,6,7,8]::smallint[]
  );

comment on column public.sectors.parent_sector is
  'القاطع البلدي الأب: الكرادة أو الزعفرانية؛ وكل صف يمثل منطقة تشغيلية داخله';
comment on column public.manager_profiles.sectors is
  'معرّفات المناطق التشغيلية المسندة؛ يسمح بمنطقة واحدة حتى جميع المناطق الثماني';
