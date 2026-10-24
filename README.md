# Fikirhane

Kulüp ve networking odaklı, açık/koyu temalı Fikirhane web sitesi. Site dört katmandan oluşur:

- **Visitor** (`/` ve mekân sayfaları): herkese açık keşif, tanıtım, kulüpler, program ve üyelik.
- **Member** (`/member/`): hesap açan herkes; kişisel ana sayfa, kulüpler, rezervasyonlar ve profil.
- **Host** (`/host/`): personel ile kulüp ve etkinlik sorumluları; günün programı, kapıda giriş, başvurular, kendi iş kayıtları.
- **Admin** (`/admin/`): işletme ve teknik yönetici; bütün tablolar ve ilişkileri, roller ve yetkiler, sistem.

Kimin hangi katmana girdiğini sunucu belirler (`/api/me` → `shells`). Ayrıntılar: [Shell mimarisi](docs/shells.md).

## Üyelik: gerçek hesaplar ve önizleme

Site iki modda çalışır:

- **API modu**: [backend](backend/README.md) erişilebilir olduğunda (backend siteyi kendisi sunduğunda ya da `scripts/config.js` içindeki `PAGES_API_URL` ayarlandığında). Bu modda gerçek hesap açılır ve giriş yapılır. Kulübe katılma, buluşmada yer ayırtma (üyeliğe göre fiyat, kapasite, koltuk), üyelik başvurusu ve profil sunucuda saklanır. Bütün yetki kontrolleri sunucudadır.
- **Önizleme modu**: API yoksa (örneğin henüz backend yayında değilken GitHub Pages’te) eski tarayıcı içi prototip çalışır. Bu modda e-posta veya şifre istenmez ve seçimler yalnızca o tarayıcıda kalır.

Veri modeli 48 tablo dokümanından üretilmiştir: [veri sözlüğü](docs/schema/README.md), [kararlar ve onay bekleyen varsayımlar](docs/backend-decisions.md).

## Yerel önizleme

Gerçek hesaplarla (PostgreSQL + API + site, Docker gerekmez):

```sh
cd backend && npm install && npm run dev   # http://localhost:8080
```

Yalnızca statik önizleme:

```sh
python -m http.server 4173
```

Statik önizleme için http://localhost:4173 adresini aç. Derleme veya paket kurulumu gerekmez. ES modülleri kullanıldığı için HTML dosyalarını çift tıklamak yerine HTTP üzerinden aç.

## Yayın

GitHub Pages: https://pelamx.github.io/fikirhane-web/

`main` dalındaki kök klasör GitHub Pages üzerinden yayımlanır. Üyelik ve member yolları proje alt diziniyle uyumludur; özel rewrite gerekmez.

Gerçek hesaplı sürüm (PostgreSQL + API + site) Render'da çalışır: kökteki [`render.yaml`](render.yaml) Blueprint'i veritabanını ve container'ı birlikte kurar. Adımlar: [backend/README.md › Render](backend/README.md#render).

## İçerik ve görseller

- Kulüp metinleri, kaynak bağlantıları ve örnek program: https://www.fikirhane.co/ng/ (21 Ekim 2026).
- Takvim tarihli bir içerik örneğidir; gerçek zamanlı uygunluk göstermez.
- Gerçek üyelik, etkinlik katılımı ve rezervasyonlar mevcut Fikirhane sitesinde tamamlanır.
- Açık ve koyu logolar Fikirhane tarafından sağlanmıştır.
- Önceki düşük çözünürlüklü fotoğraflar kaldırılmıştır. Yeni temsili Unsplash fotoğrafları 2301–2400 piksel genişliğindedir; responsive 960 piksel alternatifleri vardır. Gerçek mekân fotoğrafı oldukları iddia edilmez. [Fotoğraf kaynakları](assets/photos/README.md).
- Tema tercihi ve önizleme profili tarayıcıda saklanır.
- Yazı tipleri Google Fonts üzerinden yüklenir; sistem yazı tipi yedekleri vardır.

## Doğrulama

Tarayıcıda guest → onboarding → member geçişi, hedef kulübü koruma, kulüp takibi/çıkarma, arama/filtre, boş durumlar, plan ekleme/çıkarma, profil kaydetme ve güvenli metin gösterimi, açık/koyu tema, çıkış/devam/silme ve 360–1440 piksel arasında altı genişlikte üye sayfaları kontrol edilmiştir. Büyük ekran ana görselinin 2400 × 1601 piksel kaynağı kullandığı doğrulanmıştır.
