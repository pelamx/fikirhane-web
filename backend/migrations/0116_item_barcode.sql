-- Kitchen self-service scans the product's own barcode (EAN-8/13, UPC-A/E, or a printed code 128 of digits) to find it.
-- A supporting column, not in ITEMS.md: one product per barcode; items made in the kitchen have none.
alter table items add column barcode text check (barcode ~ '^[0-9]{8,14}$');
create unique index items_barcode_uq on items (barcode) where barcode is not null;
