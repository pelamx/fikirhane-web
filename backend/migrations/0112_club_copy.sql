-- Club texts for the new positioning: work and interest-based clubs, networking in the background. Only rows that still carry
-- the original seed text are changed, so a description edited in the admin stays as it is.

update clubs set club_description = 'Kendi işine, projene ya da öğrenimine odaklanabileceğin rezervasyonlu ortak çalışma seansları. Sabit masa ya da uzun dönem ofis üyeliği gerekmez.'
  where club_code = 'WORKING' and club_description = 'Fikrini iş modeline dönüştürmek isteyenler için haftalık sohbetler ve mentor buluşmaları.';
update clubs set club_description = 'İngilizceyi düzenli kullanabileceğin bir ortam: konuşma pratiği, telaffuz, iş İngilizcesi ve farklı temalar etrafında tekrar eden programlar.'
  where club_code = 'ENGLISH' and club_description = 'Her hafta farklı bir konuda İngilizce sohbet: başlangıç seviyesinden akıcı konuşanlara herkes davetli. Buluşmalar Fikirhane’de; çay ve kahve bizden.';
update clubs set club_description = 'Kısa öykü, deneme ve şiir üzerine düzenli yazma oturumları. Her buluşmada küçük bir yazma alıştırması ve bir geri bildirim turu var; deneyim şartı yok.'
  where club_code = 'WRITING' and club_description = 'Kısa öykü, deneme ve şiir üzerine birlikte yazıp okuyoruz. Her buluşmada küçük bir yazma alıştırması ve nazik bir geri bildirim turu var; deneyim şartı yok, merak yeter.';
