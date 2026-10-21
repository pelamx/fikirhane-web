// Turkish names for database columns and coded values in the admin shell. Raw names stay available as tooltips.

export const COLUMN_LABELS = {
  accepted_at: 'Kabul zamanı', account_code: 'Hesap kodu', account_name: 'Hesap adı', account_reference: 'Hesap referansı', account_status: 'Hesap durumu',
  account_type: 'Hesap türü', agreed_content_post_limit: 'Anlaşılan içerik paylaşımı', agreed_event_limit: 'Anlaşılan etkinlik sayısı',
  agreed_guest_pass_limit: 'Anlaşılan misafir geçişi', agreed_speaker_nomination_limit: 'Anlaşılan konuşmacı önerisi', allocated_amount: 'Eşleştirilen tutar',
  allocation_at: 'Eşleştirme zamanı', amount: 'Tutar', approved_at: 'Onay zamanı', approved_by_user_id: 'Onaylayan', assigned_at: 'Atanma zamanı',
  assigned_by_user_id: 'Atayan', bank_name: 'Banka', base_price: 'Temel fiyat', billing_address: 'Fatura adresi', billing_name: 'Fatura adı',
  billing_period: 'Faturalama dönemi', billing_tax_number: 'Fatura vergi no', billing_tax_office: 'Fatura vergi dairesi', bio: 'Hakkında',
  booked_at: 'Rezervasyon zamanı', booked_by_user_id: 'Ayırtan', booking_mode: 'Rezervasyon şekli', booking_priority: 'Rezervasyon önceliği',
  booking_source: 'Rezervasyon kaynağı', booking_status: 'Rezervasyon durumu', booking_unit: 'Rezervasyon birimi', booking_unit_grant: 'Verilen birim',
  branding_level: 'Marka görünürlüğü', budget_amount: 'Bütçe', campaign_code: 'Kampanya kodu', campaign_name: 'Kampanya adı', campaign_type: 'Kampanya türü',
  cancellation_reason: 'İptal nedeni', cancelled_at: 'İptal zamanı', cancelled_by_user_id: 'İptal eden', capacity: 'Kapasite', category: 'Kategori',
  category_code: 'Kategori kodu', category_group: 'Kategori grubu', category_name: 'Kategori adı', center_code: 'Merkez kodu', center_name: 'Merkez adı',
  center_type: 'Merkez türü', checkin_at: 'Giriş zamanı', checkout_at: 'Çıkış zamanı', claimed_at: 'Kullanılma zamanı', claimed_by_user_id: 'Kullanan',
  club_code: 'Kulüp kodu', club_description: 'Kulüp açıklaması', club_event_role: 'Kulübün rolü', club_level: 'Kulüp seviyesi', club_name: 'Kulüp adı',
  club_type: 'Kulüp türü', content_post_limit: 'İçerik paylaşım hakkı', contract_reference: 'Sözleşme referansı', conversion_type: 'Dönüşüm türü',
  converted_at: 'Dönüşüm zamanı', count_date: 'Sayım tarihi', counted_quantity: 'Sayılan miktar', cover_image: 'Kapak görseli', created_at: 'Oluşturulma',
  created_by_user_id: 'Oluşturan', currency_code: 'Para birimi', current_balance: 'Güncel bakiye', current_stock: 'Güncel stok', decision_note: 'Karar notu',
  decision_reason: 'Karar nedeni', declined_at: 'Ret zamanı', default_booking_unit: 'Varsayılan birim', default_booking_unit_grant: 'Varsayılan verilen birim',
  default_duration_months: 'Varsayılan süre (ay)', default_expense_category_id: 'Varsayılan gider kategorisi', default_fee_amount: 'Varsayılan ücret',
  default_financial_center_id: 'Varsayılan finans merkezi', default_freepass_usage_limit: 'Varsayılan freepass kullanım hakkı',
  default_freepass_valid_days: 'Varsayılan freepass geçerliliği (gün)', default_price_adjustment: 'Varsayılan fiyat farkı',
  default_revenue_category_id: 'Varsayılan gelir kategorisi', default_selling_price: 'Varsayılan satış fiyatı', default_tax_rate: 'Varsayılan vergi oranı',
  description: 'Açıklama', direction: 'Yön', discount_amount: 'İndirim', discount_rate: 'İndirim oranı (%)', distribution_source: 'Dağıtım kaynağı',
  document_date: 'Belge tarihi', document_number: 'Belge no', document_type: 'Belge türü', due_date: 'Vade', email: 'E-posta', email_type: 'E-posta türü',
  enable_need: 'İhtiyaç sorulsun', enable_offer: 'Katkı sorulsun', end_at: 'Bitiş', end_date: 'Bitiş tarihi', end_datetime: 'Bitiş', event_code: 'Etkinlik kodu',
  event_description: 'Etkinlik açıklaması', event_title: 'Etkinlik adı', event_type: 'Etkinlik türü', event_user_role: 'Görev', expected_event_count: 'Beklenen etkinlik sayısı',
  expires_at: 'Son geçerlilik', fee_amount: 'Ücret', final_price: 'Ödenecek tutar', first_name: 'Ad', first_touch_at: 'İlk temas', floor: 'Kat',
  freepass_code: 'Freepass kodu', freepass_type: 'Freepass türü', from_account_id: 'Çıkış hesabı', grand_total: 'Genel toplam', gross_amount: 'Brüt tutar',
  guest_email: 'Misafir e-postası', guest_first_name: 'Misafir adı', guest_last_name: 'Misafir soyadı', guest_pass_limit: 'Misafir geçiş hakkı',
  guest_phone: 'Misafir telefonu', headline: 'Kısa tanıtım', height: 'Yükseklik', indoor_outdoor: 'İç / dış mekân', interest_code: 'İlgi alanı kodu',
  interest_name: 'İlgi alanı', invitation_code: 'Davet kodu', invitation_type: 'Davet türü', invited_by_organization_id: 'Davet eden kurum',
  invited_by_user_id: 'Davet eden', invited_user_id: 'Davet edilen', is_management_role: 'Yönetim rolü', is_manual_booking: 'Elle girildi', is_primary: 'Birincil',
  is_primary_sponsor: 'Ana sponsor', is_purchasable: 'Satın alınabilir', is_sellable: 'Satılabilir', is_stock_tracked: 'Stok takibi', is_system_role: 'Sistem rolü',
  is_verified: 'Doğrulandı', issued_at: 'Verilme zamanı', issued_by_user_id: 'Veren', issued_to_email: 'Verilen e-posta', issued_to_name: 'Verilen kişi',
  issued_to_phone: 'Verilen telefon', item_category: 'Ürün kategorisi', item_code: 'Ürün kodu', item_name: 'Ürün adı', item_type: 'Ürün türü',
  joined_source: 'Katılım kaynağı', landing_source: 'Geliş sayfası', last_name: 'Soyad', legal_name: 'Ticari unvan', line_no: 'Satır no', line_total: 'Satır toplamı',
  location_code: 'Mekân kodu', location_name: 'Mekân adı', location_type: 'Mekân türü', logo: 'Logo', map_aspect_ratio: 'Harita oranı', map_image: 'Harita görseli',
  max_active_bookings: 'En fazla aktif rezervasyon', max_capacity: 'Azami kapasite', medium: 'Kanal', membership_type_code: 'Üyelik kodu',
  membership_type_name: 'Üyelik adı', minimum_attendees: 'En az katılımcı', motivation_text: 'Motivasyon', movement_at: 'Hareket zamanı', movement_type: 'Hareket türü',
  need_text: 'İhtiyaç', need_text_snapshot: 'İhtiyaç (o anki)', net_amount: 'Net tutar', networking_enabled: 'Tanışmaya açık', notes: 'Notlar', offer_text: 'Katkı',
  offer_text_snapshot: 'Katkı (o anki)', opening_balance: 'Açılış bakiyesi', opening_balance_date: 'Açılış tarihi', option_code: 'Seçenek kodu',
  option_name: 'Seçenek adı', organization_event_role: 'Kurumun rolü', organization_name: 'Kurum adı', organization_role: 'Kurum rolü',
  organization_type: 'Kurum türü', override_reason: 'İstisna gerekçesi', payment_method: 'Ödeme yöntemi', payment_status: 'Ödeme durumu', plan_code: 'Paket kodu',
  plan_name: 'Paket adı', position_x: 'Konum X', position_y: 'Konum Y', posted_at: 'Kesinleşme zamanı', posted_by_user_id: 'Kesinleştiren',
  price_adjustment: 'Fiyat farkı', price_list_amount: 'Liste fiyatı', priority: 'Öncelik', priority_booking_enabled: 'Öncelikli rezervasyon',
  priority_level: 'Öncelik seviyesi', profile_photo: 'Profil fotoğrafı', profile_visibility: 'Profil görünürlüğü', provider_name: 'Sağlayıcı',
  provider_transaction_id: 'Sağlayıcı işlem no', quantity: 'Miktar', reason_code: 'Neden kodu', redeemed_at: 'Kullanım zamanı', reference_id: 'Referans kaydı',
  reference_number: 'Referans no', reference_type: 'Referans türü', referrer_organization_id: 'Yönlendiren kurum', referrer_user_id: 'Yönlendiren',
  registration_number: 'Sicil no', reorder_level: 'Yeniden sipariş seviyesi', reservable: 'Rezerve edilebilir', reservation_window_days: 'Rezervasyon penceresi (gün)',
  reversal_reason: 'Geri alma nedeni', reversed_at: 'Geri alınma zamanı', reversed_by_user_id: 'Geri alan', reversed_movement_id: 'Geri alınan hareket',
  reviewed_at: 'İnceleme zamanı', reviewed_by_user_id: 'İnceleyen', revoked_at: 'Geri alınma zamanı', revoked_by_user_id: 'Geri alan', role_code: 'Rol kodu',
  role_name: 'Rol adı', role_rank: 'Rol sırası', role_type: 'Rol türü', rotation: 'Dönüş açısı', seat_capacity: 'Koltuk sayısı', seat_code: 'Koltuk kodu',
  seat_name: 'Koltuk adı', seat_selection_enabled: 'Koltuk seçimi', seat_type: 'Koltuk türü', sent_at: 'Gönderilme zamanı', series_code: 'Seri kodu',
  series_name: 'Seri adı', series_type: 'Seri türü', setup_code: 'Düzen kodu', setup_name: 'Düzen adı', setup_type: 'Düzen türü', shape: 'Biçim',
  show_interests: 'İlgi alanları gösterilsin', show_skills: 'Beceriler gösterilsin', skill_code: 'Beceri kodu', skill_level: 'Seviye', skill_name: 'Beceri',
  sort_order: 'Sıra', source: 'Kaynak', speaker_nomination_limit: 'Konuşmacı önerisi hakkı', sponsored_events_limit: 'Sponsorlu etkinlik hakkı',
  sponsorship_name: 'Sponsorluk adı', start_at: 'Başlangıç', start_date: 'Başlangıç tarihi', start_datetime: 'Başlangıç', status: 'Durum',
  stock_behavior: 'Stok davranışı', storage_area: 'Depo alanı', submitted_at: 'Gönderilme zamanı', subtotal_amount: 'Ara toplam', system_quantity: 'Sistemdeki miktar',
  table_code: 'Masa kodu', table_name: 'Masa adı', target_audience: 'Hedef kitle', target_stock: 'Hedef stok', tax_amount: 'Vergi', tax_number: 'Vergi no',
  tax_office: 'Vergi dairesi', tax_rate: 'Vergi oranı', timezone: 'Saat dilimi', to_account_id: 'Giriş hesabı', transaction_at: 'İşlem zamanı',
  transaction_type: 'İşlem türü', unit: 'Birim', unit_cost: 'Birim maliyet', unit_price: 'Birim fiyat', updated_at: 'Son düzenleme', updated_by_user_id: 'Son düzenleyen',
  usage_date: 'Kullanım tarihi', usage_limit: 'Kullanım hakkı', usage_type: 'Kullanım türü', utm_campaign: 'UTM kampanya', utm_content: 'UTM içerik',
  utm_medium: 'UTM kanal', utm_source: 'UTM kaynak', utm_term: 'UTM terim', valid_from: 'Geçerlilik başlangıcı', valid_until: 'Geçerlilik sonu',
  variance_quantity: 'Fark', verified_at: 'Doğrulanma zamanı', verified_by_user_id: 'Doğrulayan', version_no: 'Sürüm', waitlist_until: 'Bekleme sonu',
  website: 'Web sitesi', width: 'Genişlik',
};

/** Singular names for id_* columns: the record a column points to (or the record itself when it is the key). */
export const ENTITY_LABELS = {
  account: 'Hesap', booking: 'Rezervasyon', campaign: 'Kampanya', club: 'Kulüp', club_member_role: 'Kulüp rolü', club_sponsorship: 'Kulüp sponsorluğu',
  club_user: 'Kulüp üyeliği', document: 'Belge', document_item: 'Belge satırı', event: 'Etkinlik', event_club: 'Etkinlik kulübü', event_option: 'Etkinlik seçeneği',
  event_organization: 'Etkinlik kurumu', event_series: 'Etkinlik serisi', event_user: 'Etkinlik görevi', financial_category: 'Finans kategorisi',
  financial_center: 'Finans merkezi', freepass: 'Freepass', freepass_redemption: 'Freepass kullanımı', interest: 'İlgi alanı', invitation: 'Davet', item: 'Ürün',
  location: 'Mekân', membership_application: 'Üyelik başvurusu', membership_type: 'Üyelik tipi', membership_type_at_booking: 'Rezervasyondaki üyelik',
  need: 'İhtiyaç', offer: 'Katkı', organization: 'Kurum', organization_role: 'Kurum rolü', organization_user: 'Kurum kullanıcısı', role: 'Rol', seat: 'Koltuk',
  skill: 'Beceri', space_setup: 'Yerleşim düzeni', sponsorship_plan: 'Sponsorluk paketi', sponsorship_usage: 'Sponsorluk kullanımı', stock_count: 'Stok sayımı',
  stock_count_item: 'Sayım satırı', stock_movement: 'Stok hareketi', table: 'Masa', transaction: 'Para hareketi', transaction_allocation: 'Ödeme eşleştirmesi',
  user: 'Kişi', user_acquisition: 'Kazanım kaydı', user_email: 'E-posta kaydı', user_interest: 'İlgi kaydı', user_membership: 'Üyelik', user_role: 'Rol ataması',
  user_skill: 'Beceri kaydı',
};

export function columnLabel(name, isKey = false) {
  if (COLUMN_LABELS[name]) return COLUMN_LABELS[name];
  const id = /^id_(.+)$/.exec(name);
  if (id) return isKey ? 'Kayıt no' : ENTITY_LABELS[id[1]] ?? id[1].replace(/_/g, ' ');
  return name.replace(/_/g, ' ');
}

/** Coded values, by column where the same word means different things, then by value. */
const BY_COLUMN = {
  booking_unit: { seat: 'Koltuk', table: 'Masa', location: 'Alan' },
  default_booking_unit: { seat: 'Koltuk', table: 'Masa', location: 'Alan' },
  direction: { sale: 'Satış', purchase: 'Alış', in: 'Giriş', out: 'Çıkış' },
  profile_visibility: { private: 'Gizli', community: 'Topluluk' },
};
const VALUES = {
  unpaid: 'Ödenmedi', pending: 'Bekliyor', paid: 'Ödendi', partially_paid: 'Kısmen ödendi', refunded: 'İade edildi', partially_refunded: 'Kısmen iade', waived: 'Ücretsiz',
  web: 'Web', mobile_app: 'Mobil uygulama', staff: 'Personel', phone: 'Telefon', whatsapp: 'WhatsApp', walk_in: 'Kapıdan', invitation: 'Davet', freepass: 'Freepass',
  user_request: 'Kişinin isteği', event_cancelled: 'Etkinlik iptal', payment_failed: 'Ödeme başarısız', duplicate: 'Mükerrer', admin_override: 'Yönetici kararı', other: 'Diğer',
  workspace: 'Çalışma alanı', meetup: 'Buluşma', workshop: 'Atölye', talk: 'Konuşma', class: 'Ders', social: 'Sosyal', language: 'Dil', creative: 'Yaratıcılık',
  technology: 'Teknoloji', education: 'Eğitim', professional: 'Profesyonel', organizer: 'Düzenleyen', co_organizer: 'Ortak düzenleyen', partner: 'Partner',
  host: 'Ev sahibi', tutor: 'Eğitmen', speaker: 'Konuşmacı', moderator: 'Moderatör', facilitator: 'Kolaylaştırıcı',
  personal: 'Kişisel', work: 'İş', system: 'Sistem', service: 'Hizmet', technical: 'Teknik', beginner: 'Başlangıç', intermediate: 'Orta', advanced: 'İleri',
  expert: 'Uzman', native: 'Ana dil', monthly: 'Aylık', quarterly: 'Üç aylık', yearly: 'Yıllık', annual: 'Yıllık', custom: 'Özel', one_time: 'Tek seferlik',
  cash: 'Nakit', bank: 'Banka', pos: 'POS', card: 'Kart', bank_transfer: 'Havale/EFT', credit_card: 'Kredi kartı', online: 'Online',
  income: 'Gelir', expense: 'Gider', revenue: 'Gelir', company: 'Şirket', university: 'Üniversite', ngo: 'STK', community: 'Topluluk', government: 'Kamu',
  agency: 'Ajans', sponsor: 'Sponsor', customer: 'Müşteri', supplier: 'Tedarikçi', admin: 'Yönetici', member: 'Üye', cowork: 'Ortak çalışma',
  classroom: 'Sınıf', u_shape: 'U düzeni', boardroom: 'Toplantı masası', chairs_only: 'Sadece sandalye', standing: 'Ayakta',
  meeting_room: 'Toplantı odası', event_space: 'Etkinlik alanı', cafeteria: 'Kafeterya', terrace: 'Teras', support_area: 'Destek alanı',
  indoor: 'İç mekân', outdoor: 'Dış mekân', product: 'Ürün', receipt: 'Giriş', consumption: 'Tüketim', waste: 'Fire', adjustment: 'Düzeltme', sale: 'Satış', purchase: 'Alış',
};
export function valueLabel(column, value) {
  if (typeof value !== 'string' || !/^[a-z_]+$/.test(value)) return null;
  return BY_COLUMN[column]?.[value] ?? VALUES[value] ?? null;
}
