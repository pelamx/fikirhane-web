// Public catalog shared by both shells. Snapshot from fikirhane.co/ng, 2026-10-21. With the API, club texts and events come from the
// backend; this file still provides presentation (art words, prompt, category label) keyed by club code.
export const clubs = [
  { id: 'work', code: 'WORKING', name: 'Çalışma Kulübü', sourceName: 'Calisma Klubu', category: 'Girişimcilik', description: 'Fikrini iş modeline dönüştürmek isteyenler için haftalık sohbetler ve mentor buluşmaları.', prompt: 'Fikrini masaya getir.', words: ['Bir fikrim var.', 'Konuşalım.'], sourceUrl: 'https://www.fikirhane.co/ng/kulupler/2' },
  { id: 'language', code: 'ENGLISH', name: 'İngilizce Konuşma Kulübü', sourceName: 'Örnek İngilizce Konuşma Kulübü', category: 'Dil', description: 'Her hafta farklı bir konuda İngilizce sohbet: başlangıç seviyesinden akıcı konuşanlara herkes davetli. Buluşmalar Fikirhane’de; çay ve kahve bizden.', prompt: 'Sohbetin dili ortak.', words: ['Hello, stranger.', 'Merhaba, arkadaşım.'], sourceUrl: 'https://www.fikirhane.co/ng/kulupler/1' },
  { id: 'writing', code: 'WRITING', name: 'Yaratıcı Yazarlık Kulübü', sourceName: 'Örnek Yaratıcı Yazarlık Kulübü', category: 'Yaratıcılık', description: 'Kısa öykü, deneme ve şiir üzerine birlikte yazıp okuyoruz. Her buluşmada küçük bir yazma alıştırması ve nazik bir geri bildirim turu var; deneyim şartı yok, merak yeter.', prompt: 'Birlikte yazıp okuyoruz.', words: ['Nereden başlasam?', 'Bir cümleden.'], sourceUrl: 'https://www.fikirhane.co/ng/kulupler/3' }
];
export const events = [
  { id: 'culture-2026-10-24', clubId: 'language', name: 'Culture, Food and Traditions', day: '24', month: 'EKİM', date: '24 Ekim 2026, Cumartesi', time: '14.00 — 16.00', location: 'Fikirhane', sourceUrl: 'https://www.fikirhane.co/ng/giris?donus=%2Fprofil%2Fetkinlikler%2F24' }
];
