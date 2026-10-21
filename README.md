# Fikirhane

Kulüp ve networking odaklı, açık/koyu temalı Fikirhane web sitesi. İlk aşama iki ayrı arayüz içerir:

- **Public** (`/`): keşif, tanıtım, kulüpler ve program.
- **Member** (`/member/`): kişisel ana sayfa, kulüp keşfi/takibi, kişisel buluşma planı ve profil.

Host ve admin sonraki aşamalardır. Ayrıntılar: [Shell mimarisi](docs/shells.md).

## Önemli: üyelik önizlemesi

Mevcut GitHub Pages yayını bir arayüz prototipidir. `/uyelik/` üzerinden adını ve ilgi alanlarını seçerek member alanına geçebilirsin. Gerçek hesap oluşturulmaz; e-posta veya şifre toplanmaz. Seçimler yalnızca mevcut tarayıcıda saklanır. Oturumdan çıkma, kaldığın yerden devam etme ve önizlemeyi silme desteklenir.

Gerçek kayıt/giriş, doğrulanmış üyelik, sunucuda rol kontrolü ve kalıcı çok kullanıcılı veriler için ayrı bir backend gerekir. İstemci tarafındaki yönlendirme bir güvenlik sınırı değildir.

## Yerel önizleme

```sh
python -m http.server 4173
```

http://localhost:4173 adresini aç. Derleme veya paket kurulumu gerekmez. ES modülleri kullanıldığı için HTML dosyalarını çift tıklamak yerine HTTP üzerinden aç.

## Yayın

GitHub Pages: https://pelamx.github.io/fikirhane-web/

`main` dalındaki kök klasör GitHub Pages üzerinden yayımlanır. Üyelik ve member yolları proje alt diziniyle uyumludur; özel rewrite gerekmez.

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
