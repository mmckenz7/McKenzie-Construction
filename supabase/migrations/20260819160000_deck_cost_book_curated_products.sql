begin;

do $audit$
begin
  if to_regclass('public.material_catalog') is null then
    raise exception 'Required table public.material_catalog is missing.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'material_catalog'
      and indexname = 'material_catalog_product_code_uidx'
  ) then
    raise exception 'The reviewed material identity contract is unavailable.';
  end if;
end
$audit$;

insert into public.material_catalog (
  sku,
  category,
  description,
  brand,
  product_line,
  unit,
  unit_cost,
  waste_percent,
  is_active,
  metadata,
  mckenzie_product_code,
  canonical_name,
  lifecycle_status
)
select
  seed.sku,
  seed.category,
  seed.description,
  seed.brand,
  seed.product_line,
  seed.unit,
  0,
  seed.waste_percent,
  true,
  jsonb_build_object(
    'created_from', 'deck_cost_book_curated_products_v1',
    'product_url', seed.product_url,
    'deck_product_kind', seed.deck_product_kind,
    'decking_family', seed.decking_family,
    'composite_color', seed.composite_color,
    'railing_family', seed.railing_family,
    'stock_length_feet', seed.stock_length_feet,
    'price_status', 'not_verified',
    'review_note', 'Exact product identity retained in the curated McKenzie deck cost-book set. Price is intentionally separate.'
  ),
  seed.product_code,
  seed.description,
  'active'
from (values
  (
    '3185451', 'decking',
    'Severe Weather 5/4-in x 6-in x 16-ft pressure-treated Southern yellow pine deck board',
    'Severe Weather', 'Pressure Treated', 'each', 10::numeric,
    'https://www.lowes.com/pd/Severe-Weather-Pressure-Treated-Deck-Board/3185451',
    'deck_board', 'wood', null, null, 16::numeric,
    'MCK-DECK-PT-BOARD-16'
  ),
  (
    '5014070805', 'decking_fasteners',
    'Deck Plus #8 x 2-in exterior wood-to-wood deck screws, 625-count box',
    'Deck Plus', 'Exterior Wood Deck Screws', 'box', 0::numeric,
    'https://www.lowes.com/pd/Deck-Plus-8-x-2-in-Wood-to-wood-Deck-Screws-625-Per-Box/5014070805',
    'deck_fastener', 'wood', null, null, null::numeric,
    'MCK-DECK-DECKPLUS-625'
  ),
  (
    '5017400727', 'decking',
    'Trex Select Whiskey Barrel 1-in x 6-in x 16-ft grooved composite deck board',
    'Trex', 'Select Whiskey Barrel', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Select-1-in-x-6-in-x-16-ft-Whiskey-Barrel-Grooved-Composite-Deck-board/5017400727',
    'deck_board_grooved', 'composite', 'brown', null, 16::numeric,
    'MCK-DECK-TREX-SELECT-WHISKEY-GROOVED-16'
  ),
  (
    '5017400701', 'decking',
    'Trex Select Whiskey Barrel 1-in x 6-in x 16-ft square-edge composite deck board',
    'Trex', 'Select Whiskey Barrel', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Select-1-in-x-6-in-x-16-ft-Whiskey-Barrel-Square-Composite-Deck-board/5017400701',
    'deck_board_square_edge', 'composite', 'brown', null, 16::numeric,
    'MCK-DECK-TREX-SELECT-WHISKEY-SQUARE-16'
  ),
  (
    '5013822305', 'decking',
    'Trex Select Pebble Grey 1-in x 6-in x 16-ft grooved composite deck board',
    'Trex', 'Select Pebble Grey', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Select-0-82-in-x-5-5-in-5-5-in-x-16-ft-Pebble-Grey-Grooved-Composite-Deck-Board/5013822305',
    'deck_board_grooved', 'composite', 'gray', null, 16::numeric,
    'MCK-DECK-TREX-SELECT-PEBBLE-GROOVED-16'
  ),
  (
    '5013822299', 'decking',
    'Trex Select Pebble Grey 1-in x 6-in x 16-ft square-edge composite deck board',
    'Trex', 'Select Pebble Grey', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Select-1-in-x-6-in-x-16-ft-Pebble-Grey-Square-Composite-Deck-board/5013822299',
    'deck_board_square_edge', 'composite', 'gray', null, 16::numeric,
    'MCK-DECK-TREX-SELECT-PEBBLE-SQUARE-16'
  ),
  (
    '1000763612', 'decking',
    'Trex Enhance Naturals Toasted Sand 1-in x 6-in x 16-ft grooved composite deck board',
    'Trex', 'Enhance Naturals Toasted Sand', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Enhance-Naturals-16-ft-Toasted-Sand-Grooved-Composite-Deck-Board/1000763612',
    'deck_board_grooved', 'composite', 'cedar', null, 16::numeric,
    'MCK-DECK-TREX-ENHANCE-TOASTED-GROOVED-16'
  ),
  (
    '1000841786', 'decking',
    'Trex Enhance Naturals Toasted Sand 1-in x 6-in x 16-ft square-edge composite deck board',
    'Trex', 'Enhance Naturals Toasted Sand', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Enhance-Naturals-1-in-x-6-in-x-16-ft-Toasted-Sand-Composite-Deck-board/1000841786',
    'deck_board_square_edge', 'composite', 'cedar', null, 16::numeric,
    'MCK-DECK-TREX-ENHANCE-TOASTED-SQUARE-16'
  ),
  (
    '1000715238', 'decking',
    'Trex Transcend Spiced Rum 1-in x 6-in x 16-ft grooved composite deck board',
    'Trex', 'Transcend Spiced Rum', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Transcend-16-ft-Spiced-Rum-Grooved-Composite-Deck-Board/1000715238',
    'deck_board_grooved', 'composite', 'redwood', null, 16::numeric,
    'MCK-DECK-TREX-TRANSCEND-SPICED-GROOVED-16'
  ),
  (
    '1000714256', 'decking',
    'Trex Transcend Spiced Rum 1-in x 6-in x 16-ft square-edge composite deck board',
    'Trex', 'Transcend Spiced Rum', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Transcend-16-ft-Spiced-Rum-Composite-Deck-Board/1000714256',
    'deck_board_square_edge', 'composite', 'redwood', null, 16::numeric,
    'MCK-DECK-TREX-TRANSCEND-SPICED-SQUARE-16'
  ),
  (
    '1000712902', 'decking',
    'Trex Transcend Island Mist 1-in x 6-in x 16-ft grooved composite deck board',
    'Trex', 'Transcend Island Mist', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Transcend-16-ft-Island-Mist-Grooved-Composite-Deck-Board/1000712902',
    'deck_board_grooved', 'composite', 'coastal', null, 16::numeric,
    'MCK-DECK-TREX-TRANSCEND-ISLAND-GROOVED-16'
  ),
  (
    '1000713010', 'decking',
    'Trex Transcend Island Mist 1-in x 6-in x 16-ft square-edge composite deck board',
    'Trex', 'Transcend Island Mist', 'each', 10::numeric,
    'https://www.lowes.com/pd/Trex-Transcend-16-ft-Island-Mist-Composite-Deck-Board/1000713010',
    'deck_board_square_edge', 'composite', 'coastal', null, 16::numeric,
    'MCK-DECK-TREX-TRANSCEND-ISLAND-SQUARE-16'
  ),
  (
    '1002829278', 'railing',
    'Deckorators Contemporary 8-ft x 36-in matte-black pre-assembled aluminum level rail kit',
    'Deckorators', 'Contemporary', 'kit', 0::numeric,
    'https://www.lowes.com/pd/Deckorators-Assembled-8-ft-x-3-ft-Contemporary-Matte-Black-Square-Aluminum-Deck-Rail-Kit-with-Balusters/1002829278',
    'railing_level_kit', null, null, 'metal', 8::numeric,
    'MCK-RAIL-DECKORATORS-CONTEMP-LEVEL-8'
  ),
  (
    '1000796326', 'railing',
    'Deckorators Contemporary 39-in matte-black aluminum post kit with cap and skirt',
    'Deckorators', 'Contemporary', 'kit', 0::numeric,
    'https://www.lowes.com/pd/deckorators-common-3-in-x-3-in-x-3-1-4-ft-actual-2-5-in-x-2-5-in-x-3-28-ft-matte-black-aluminum-deck-post/1000796326',
    'railing_level_post', null, null, 'metal', null::numeric,
    'MCK-RAIL-DECKORATORS-CONTEMP-POST-39'
  ),
  (
    '1000796316', 'railing',
    'Deckorators Contemporary 6-ft matte-black pre-assembled aluminum stair rail kit',
    'Deckorators', 'Contemporary', 'kit', 0::numeric,
    'https://www.lowes.com/pd/deckorators-assembled-5-71-ft-x-2-91-ft-matte-black-aluminum-stair-rail-kit-with-balusters/1000796316',
    'railing_stair_kit', null, null, 'metal', 6::numeric,
    'MCK-RAIL-DECKORATORS-CONTEMP-STAIR-6'
  ),
  (
    '1000796350', 'railing',
    'Deckorators Contemporary 48-in matte-black aluminum lower stair post kit with cap and skirt',
    'Deckorators', 'Contemporary', 'kit', 0::numeric,
    'https://www.lowes.com/pd/deckorators-common-3-in-x-3-in-x-4-ft-actual-2-5-in-x-2-5-in-x-4-03-ft-matte-black-aluminum-deck-post/1000796350',
    'railing_stair_lower_post', null, null, 'metal', null::numeric,
    'MCK-RAIL-DECKORATORS-CONTEMP-LOWER-48'
  ),
  (
    '5001785235', 'railing',
    'Deckorators Contemporary Cable 8-ft x 36-in textured-black top rail kit',
    'Deckorators', 'Contemporary Cable', 'kit', 0::numeric,
    'https://www.lowes.com/pd/Deckorators-Contemporary-cable-8-ft-x-36-in-Textured-Black-Aluminum-Deck-Cable-Rail-Kit/5001785235',
    'railing_level_kit', null, null, 'cable', 8::numeric,
    'MCK-RAIL-DECKORATORS-CABLE-TOP-8'
  ),
  (
    '5001747843', 'railing',
    'Deckorators Contemporary Cable 39-in textured-black line post kit',
    'Deckorators', 'Contemporary Cable', 'kit', 0::numeric,
    'https://www.lowes.com/pd/Deckorators-Cable-Line-Post-39-in-Textured-Black/5001747843',
    'railing_level_post', null, null, 'cable', null::numeric,
    'MCK-RAIL-DECKORATORS-CABLE-LINE-POST-39'
  ),
  (
    '5001740061', 'railing',
    'Deckorators Contemporary Cable 39-in textured-black end post kit',
    'Deckorators', 'Contemporary Cable', 'kit', 0::numeric,
    'https://www.lowes.com/pd/Deckorators-Cable-End-Post-39-in-Textured-Black/5001740061',
    'railing_cable_end_post', null, null, 'cable', null::numeric,
    'MCK-RAIL-DECKORATORS-CABLE-END-POST-39'
  ),
  (
    '5001749061', 'railing',
    'Deckorators Contemporary Cable 10-ft stainless cable and hardware pack',
    'Deckorators', 'Contemporary Cable', 'kit', 0::numeric,
    'https://www.lowes.com/pd/Deckorators-Cable-10-ft-with-Hardware-Kit/5001749061',
    'railing_cable_pack', null, null, 'cable', 10::numeric,
    'MCK-RAIL-DECKORATORS-CABLE-PACK-10'
  ),
  (
    '5001746387', 'railing',
    'Deckorators Contemporary Cable 8-ft textured-black stair top rail kit',
    'Deckorators', 'Contemporary Cable', 'kit', 0::numeric,
    'https://www.lowes.com/pd/Deckorators-Contemporary-Cable-8-ft-x-2-in-Textured-Black-Aluminum-Deck-Stair-Cable-Rail-Kit/5001746387',
    'railing_stair_kit', null, null, 'cable', 8::numeric,
    'MCK-RAIL-DECKORATORS-CABLE-STAIR-8'
  ),
  (
    '5001746019', 'railing',
    'Deckorators Contemporary Cable 54-in textured-black lower stair post kit',
    'Deckorators', 'Contemporary Cable', 'kit', 0::numeric,
    'https://www.lowes.com/pd/Deckorators-Contemporary-Cable-2-5-in-x-2-5-in-x-4-1-2-ft-Textured-Black-Aluminum-Deck-Bottom-Stair-Post/5001746019',
    'railing_stair_lower_post', null, null, 'cable', null::numeric,
    'MCK-RAIL-DECKORATORS-CABLE-LOWER-54'
  ),
  (
    '476179', 'framing',
    'Severe Weather #2 ground-contact pressure-treated 2-in x 8-in x 16-ft lumber',
    'Severe Weather', 'Ground Contact Pressure Treated', 'each', 10::numeric,
    'https://www.lowes.com/pd/Severe-Weather-2-in-x-8-in-x-16-ft-2-Hem-Fir-Ground-Contact-Pressure-Treated-Lumber/50017310',
    'framing_lumber', null, null, null, 16::numeric,
    'MCK-FRAMING-PT-2X8X16'
  ),
  (
    '1255884', 'framing',
    'Severe Weather #2 Prime pressure-treated Southern yellow pine 2-in x 10-in x 16-ft lumber',
    'Severe Weather', 'Ground Contact Pressure Treated', 'each', 10::numeric,
    'https://www.lowes.com/pd/Severe-Weather-Common-2-in-x-10-in-x-16-ft-Actual-1-5-in-x-9-25-in-x-16-ft-2-Prime-Treated-Lumber/1000731952',
    'framing_lumber', null, null, null, 16::numeric,
    'MCK-FRAMING-PT-2X10X16'
  ),
  (
    '1255887', 'framing',
    'Severe Weather #2 Prime pressure-treated Southern yellow pine 2-in x 12-in x 16-ft lumber',
    'Severe Weather', 'Ground Contact Pressure Treated', 'each', 10::numeric,
    'https://www.lowes.com/pd/Severe-Weather-Common-2-in-x-12-in-x-16-ft-Actual-1-5-in-x-11-25-in-x-16-ft-2-Prime-Treated-Lumber/1000731958',
    'framing_lumber', null, null, null, 16::numeric,
    'MCK-FRAMING-PT-2X12X16'
  ),
  (
    '1255894', 'framing',
    'Severe Weather #2 pressure-treated Southern yellow pine 6-in x 6-in x 12-ft post',
    'Severe Weather', 'Ground Contact Pressure Treated', 'each', 10::numeric,
    'https://www.lowes.com/pd/Severe-Weather-Common-6-in-x-6-in-x-12-ft-Actual-5-5-in-x-5-5-in-x-12-ft-2-Treated-Lumber/1000731972',
    'framing_lumber', null, null, null, 12::numeric,
    'MCK-FRAMING-PT-6X6X12'
  ),
  (
    '108802', 'structural_hardware',
    'Simpson Strong-Tie LUS210Z ZMAX double-shear joist hanger',
    'Simpson Strong-Tie', 'ZMAX', 'each', 0::numeric,
    'https://www.lowes.com/pd/Simpson-Strong-Tie-LUS210Z-Double-Shear-Hanger-Z-Max/1118587',
    'structural_hardware', null, null, null, null::numeric,
    'MCK-HARDWARE-SIMPSON-LUS210Z'
  ),
  (
    '88487', 'structural_hardware',
    'Simpson Strong-Tie ABA66Z ZMAX adjustable 6-in x 6-in post base',
    'Simpson Strong-Tie', 'ZMAX', 'each', 0::numeric,
    'https://www.lowes.com/pd/Simpson-Strong-Tie-6-in-x-6-in-Triple-Zinc-Wood-To-Concrete-Retrofit-Base/3044772',
    'structural_hardware', null, null, null, null::numeric,
    'MCK-HARDWARE-SIMPSON-ABA66Z'
  ),
  (
    '2132197', 'structural_hardware',
    'Simpson Strong-Tie PB66Z ZMAX cast-in-place 6-in x 6-in post base',
    'Simpson Strong-Tie', 'ZMAX', 'each', 0::numeric,
    'https://www.lowes.com/pd/Simpson-Strong-Tie-6-in-x-6-in-Triple-Zinc-Wood-to-Concrete-Cast-in-Place-Base/1002713818',
    'structural_hardware', null, null, null, null::numeric,
    'MCK-HARDWARE-SIMPSON-PB66Z'
  )
) as seed(
  sku, category, description, brand, product_line, unit, waste_percent,
  product_url, deck_product_kind, decking_family, composite_color,
  railing_family, stock_length_feet, product_code
)
on conflict (mckenzie_product_code) where mckenzie_product_code is not null
do update set
  sku = excluded.sku,
  category = excluded.category,
  description = excluded.description,
  brand = excluded.brand,
  product_line = excluded.product_line,
  unit = excluded.unit,
  waste_percent = excluded.waste_percent,
  is_active = true,
  metadata = public.material_catalog.metadata || excluded.metadata,
  canonical_name = excluded.canonical_name,
  lifecycle_status = 'active',
  updated_at = now(),
  row_revision = public.material_catalog.row_revision + 1;

commit;
