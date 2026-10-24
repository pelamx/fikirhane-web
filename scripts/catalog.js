// Public catalog shared by both shells. Snapshot from fikirhane.co/ng, 2026-10-21. With the API, club texts and events come from the
// backend; this file still provides presentation (art words, prompt, category label) keyed by club code.
export const clubs = [
  { id: 'work', code: 'WORKING', name: 'Çalışma Kulübü', sourceName: 'Calisma Klubu', category: 'Çalışma', description: 'Kendi işine, projene ya da öğrenimine odaklanabileceğin rezervasyonlu ortak çalışma seansları. Sabit masa ya da uzun dönem ofis üyeliği gerekmez.', prompt: 'Çalışmak için gel. Ortamın bir parçası ol.', words: ['Bugün ne var?', 'Sunumu bitiriyorum.'], sourceUrl: 'https://www.fikirhane.co/ng/kulupler/2' },
  { id: 'language', code: 'ENGLISH', name: 'İngilizce Konuşma Kulübü', sourceName: 'Örnek İngilizce Konuşma Kulübü', category: 'Dil', description: 'İngilizceyi düzenli kullanabileceğin bir ortam: konuşma pratiği, telaffuz, iş İngilizcesi ve farklı temalar etrafında tekrar eden programlar.', prompt: 'İngilizceyi düzenli kullanabileceğin bir ortam.', words: ['Hello, stranger.', 'Merhaba, arkadaşım.'], sourceUrl: 'https://www.fikirhane.co/ng/kulupler/1' },
  { id: 'writing', code: 'WRITING', name: 'Yaratıcı Yazarlık Kulübü', sourceName: 'Örnek Yaratıcı Yazarlık Kulübü', category: 'Yaratıcılık', description: 'Kısa öykü, deneme ve şiir üzerine düzenli yazma oturumları. Her buluşmada küçük bir yazma alıştırması ve bir geri bildirim turu var; deneyim şartı yok.', prompt: 'Yazmayı bir alışkanlığa dönüştürmek için.', words: ['Nereden başlasam?', 'Bir cümleden.'], sourceUrl: 'https://www.fikirhane.co/ng/kulupler/3' }
];
export const events = [
  { id: 'culture-2026-10-24', clubId: 'language', name: 'Culture, Food and Traditions', day: '24', month: 'EKİM', date: '24 Ekim 2026, Cumartesi', time: '14.00 — 16.00', location: 'Fikirhane', sourceUrl: 'https://www.fikirhane.co/ng/giris?donus=%2Fprofil%2Fetkinlikler%2F24' }
];
