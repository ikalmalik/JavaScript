//IHS Fusion Method in Pan Sharpening Using landsat Imagery
// AOI 
var outline = ee.Image().byte().paint({
  featureCollection: geometry,
  color: 1,
  width: 3
});
Map.addLayer(outline, {palette: ['Red']}, "Area Studi");
var geometry = geometry;
var clipToCol = function(image){
  return image.clip(geometry);
};
Map.centerObject(geometry, 13.5);

var startDate  = '2023-01-01'
var endDate = '2024-12-31'

// === Fungsi masking awan, shadow, saturasi & nilai tidak valid ===
function maskLandsatTOA(image) {
  var qa_pixel = image.select('QA_PIXEL');
  var qa_radsat = image.select('QA_RADSAT');

  // Bit mask awan dan bayangan
  var cloudBitMask = 1 << 3;
  var cloudShadowBitMask = 1 << 4;
  var cloudMask = qa_pixel.bitwiseAnd(cloudBitMask).eq(0)
                  .and(qa_pixel.bitwiseAnd(cloudShadowBitMask).eq(0));

  // Mask saturasi piksel (nilai terlalu terang)
  var saturationMask = qa_radsat.eq(0); // nilai 0 artinya tidak saturated

  // Mask untuk validitas band
  var validBandsMask = image.select(['B2', 'B5', 'B6']).reduce(ee.Reducer.min()).gt(0);

  return image.updateMask(cloudMask)
              .updateMask(saturationMask)
              .updateMask(validBandsMask);
}

// === Koleksi Landsat 8 TOA ===
var L8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_TOA")
  .filterBounds(geometry)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUD_COVER', 1))
  .map(maskLandsatTOA);

// === Koleksi Landsat 9 TOA ===
var L9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_TOA")
  .filterBounds(geometry)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUD_COVER', 1))
  .map(maskLandsatTOA);

// === Gabungan L8 dan L9 ===
var merged = L8.merge(L9);
print("Jumlah total citra L8 + L9:", merged.size());

// === Komposit rata-rata dan sharpening ===
var mean_image = merged.mean().clip(geometry);
var panserpenIHS = function(image){
  var rgb = image.select(['B6', 'B5', 'B2']);   // SWIR1, NIR, Blue
  var pan = image.select('B8');                // Panchromatic
  var hsv = rgb.unitScale(0, 0.4).rgbToHsv();  // Scaling TOA
  var intensity = pan.unitScale(0, 0.4);
  var sharpened = ee.Image.cat([
    hsv.select('hue'),
    hsv.select('saturation'),
    intensity
  ]).hsvToRgb();
  return sharpened.multiply(255).byte();
};

var sharpenedImage = panserpenIHS(mean_image).clip(geometry);
//Map.addLayer(mean_image)
//Map.addLayer(sharpenedImage)

Map.addLayer(mean_image, {bands: ['B6', 'B5', 'B2'], min: 0.03, max: 0.4}, 'Mean RGB');
Map.addLayer(sharpenedImage, {}, 'Sharpened IHS Fusion');
