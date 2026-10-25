-- The Creative Writing Club becomes the Spanish Club. Club and financial-center codes are fixed identifiers
-- (forbid_code_change), so the row keeps club_code WRITING and its WRITING_CLUB center: members, events, roles and finance
-- history stay with it, and only the names, the type and the description change. The description is set only where it
-- still holds the seed text, so an edit made in the admin is kept.

update financial_centers set center_name = 'Spanish Club',
  description = 'Financial performance center for Spanish Club activities.'
  where center_code = 'WRITING_CLUB';

update clubs set club_name = 'İspanyolca Konuşma Kulübü', club_type = 'language'
  where club_code = 'WRITING';
update clubs set club_description = 'Konuşma pratiği, günlük hayat, seyahat ve kültür temaları etrafında tekrar eden programlar. Amaç bir ders ortamından çok, İspanyolcayı gerçek iletişim içinde düzenli kullanmak.'
  where club_code = 'WRITING' and club_description = 'Kısa öykü, deneme ve şiir üzerine düzenli yazma oturumları. Her buluşmada küçük bir yazma alıştırması ve bir geri bildirim turu var; deneyim şartı yok.';
