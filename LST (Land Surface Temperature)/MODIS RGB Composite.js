// Memusatkan peta dan menambahkan layer area studi
Map.centerObject(moi, 10);
Map.addLayer(moi, {color: "red", width: 3}, "Area Studi: Way Sekampung");
var outline = ee.Image().byte().paint({
  featureCollection: moi,
  color: 1,
  width: 3.5
});
Map.addLayer(outline, {palette: ['black']}, 'Outline');

// Mendefinisikan koleksi MODIS surface reflectance untuk Januari 2025
var modisCollection = ee.ImageCollection('MODIS/061/MOD09A1')
                      .filterDate('2025-01-01', '2025-01-08')
                      .filterBounds(moi);

// Fungsi untuk melakukan cloud masking
function maskClouds(image) {
  // Mengambil band kualitas
  var QA = image.select('QA');
  
  // Membuat mask untuk awan (bit 10 dari band QA)
  var cloudMask = QA.bitwiseAnd(1 << 10).eq(0);
  
  // Mengembalikan citra dengan mask
  return image.updateMask(cloudMask);
}

// Menerapkan cloud masking pada koleksi citra
var maskedCollection = modisCollection.map(maskClouds);

// Mengecek jumlah citra dalam koleksi setelah masking
var collectionSize = maskedCollection.size();
print('Jumlah citra dalam koleksi setelah masking:', collectionSize);

// Menghitung rata-rata jika ada citra tersedia
var modisSr;
if (collectionSize.gt(0)) {
  modisSr = maskedCollection.mean().clip(moi);
} else {
  modisSr = ee.Image().clip(moi);
  print('Tidak ada data MODIS untuk rentang tanggal yang dipilih.');
}

// Membuat komposit RGB menggunakan 3 band MODIS sebagai R, G, B
var rgbComposite = modisSr.select(['sur_refl_b01', 'sur_refl_b02', 'sur_refl_b06']);

// Menyiapkan parameter visualisasi untuk komposit RGB
var vizParams = {
  min: 0,
  max: 3000,
  bands: ['sur_refl_b01', 'sur_refl_b02', 'sur_refl_b06']
};

// Menambahkan layer komposit RGB ke peta
Map.addLayer(rgbComposite.visualize(vizParams), {}, 'MODIS Composite RGB');

// Membuat histogram untuk masing-masing band MODIS
var chart = ui.Chart.image.histogram({
  image: modisSr,
  region: moi.geometry(),
  scale: 500,
  maxBuckets: 256
})
.setSeriesNames(['Red', 'NIR', 'SWIR'])
.setOptions({
  title: 'Histogram Reflektan MODIS Surface Reflectance',
  hAxis: {
    title: 'Reflektan (dikali 1e4)',
    titleTextStyle: {italic: false, bold: true},
  },
  vAxis: {
    title: 'Frekuensi',
    titleTextStyle: {italic: false, bold: true},
  },
  colors: ['#cf513e', '#1d6b99', '#f0af07']
});
print(chart);
