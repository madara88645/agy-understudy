# AGY Live Inspector

Yerel Mac üzerinde `~/agy-sandbox` altındaki AGY koşularını izleyen salt-okunur panel.

## Başlatma

```bash
npm run viewer
```

Panel `http://localhost:3000` adresinde, dosya sistemi bridge'i ise yalnızca
`127.0.0.1:4288` adresinde çalışır. Bridge, mevcut `agy.log` dosyalarını
otomatik bulur. Gelecekteki koşular için wrapper kullanıldığında prompt, PID,
PGID, watchdog ve çıkış bilgisi de kaydedilir:

```bash
bash scripts/run-agy-sandbox.sh \
  --sandbox "$HOME/agy-sandbox/ornek-kosu" \
  --prompt-file "$HOME/agy-sandbox/ornek-kosu/prompt.txt"
```

Wrapper yalnızca `~/agy-sandbox` altındaki koşuları kabul eder ve
`--dangerously-skip-permissions` kullanmaz. Prompt kayıtları yerelde tutulur;
secret içeren promptlar kullanmayın.

## Canlı Inspector — "Antigravity şu an ne yapıyor?"

Panel açıldığında doğrudan **AGY Live Inspector** görünür (Campus Dataset Lab
üst menüden hâlâ erişilebilir). Bir koşu **çalışıyor** durumundaysa otomatik
olarak seçilir; böylece paneli koşu sırasında açtığında hemen ne olduğunu
görürsün.

Seçilen her koşuda, log akışının üstünde bir **etkinlik şeridi** durur:
Antigravity'nin log'a yazdığı doğal dil satırları (`I will read…`,
`I will run the tests…`, `Should I…?`) yerelde ayrıştırılıp sade Türkçeye
çevrilir. Faz rozetleri: **Okuyor · Keşfediyor · Planlıyor · Kod yazıyor ·
Test ediyor · Komut çalıştırıyor · Karar/soru · Raporluyor · Tamamlandı ·
Hata · Takıldı**. Bir soru/karar noktası çıkarsa ayrıca vurgulanır.

**Açıklama** sekmesi ise adım adım zaman çizelgesini ve her zaman açılabilen
bir "Antigravity nasıl çalışır?" özetini gösterir. Açıklama tamamen yereldir:
LLM çağrısı, ağ isteği veya sağlayıcı yoktur — yalnızca deterministik metin
analizi (`agy-explain.mjs`), bu yüzden testlerle doğrulanabilir.

## Campus Dataset Lab

`Campus Dataset Lab`, analiz pratiği için küçük ve **açıkça sentetik** veri
setleri üretir. Çıktılar gerçek kampüs, öğrenci veya kişi verisi değildir;
kanıt, araştırma sonucu ya da karar vermek için kullanılmamalıdır. Kişisel
bilgi, not, sağlık kaydı, kimlik veya production veri istemleri reddedilir.

- Yerel demo, deterministik campus-energy örneği üretir. Canlı web araştırması
  yapmaz; `research-sources.md` içinde bunu açıkça yazar ve kaynak uydurmaz.
- Her iş yalnızca `~/agy-sandbox/datasets/<job-id>/` altında tutulur. İş kimliği,
  path traversal ve root dışına giden symlink kontrolleri yapılır.
- Her tamamlanan demoda `dataset.csv`, `dataset.json`, `data-dictionary.md`,
  `research-sources.md`, `assumptions.md` ve `validation.json` bulunur.
- Canlı mod, sadece açıkça yapılandırılmış bir yerel sağlayıcı arayüzü ile
  kullanılabilir. Güvenli yer tutucu: `CAMPUS_DATASET_AGENT_URL=https://example.invalid/local-agent`.
  Bu proje sağlayıcı/anahtar eklemez; yapılandırma yoksa ekranda dürüstçe
  `Agent not configured` durumu gösterilir.

`npm run viewer` hem salt-okunur AGY Inspector bridge'ini (`127.0.0.1:4288`),
hem de Dataset Lab bridge'ini (`127.0.0.1:4289`) yalnızca yerel makinede açar.
