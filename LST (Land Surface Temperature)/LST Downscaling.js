//AOI
var outline = ee.Image().byte().paint({
  featureCollection: geometry,
  color: 1,
  width: 3
});
Map.addLayer(outline, {palette: ['black']}, "Area Study");
Map.centerObject(geometry, 10);

// Fungsi untuk masking awan pada Sentinel-2 menggunakan Cloud Probability Mask
function maskS2Clouds(image) {
  var cloudProb = image.select('MSK_CLDPRB'); // Masking awan dari Sentinel-2
  var mask = cloudProb.lt(50); // Ambil piksel dengan probabilitas awan < 50%
  return image.updateMask(mask);
}

// Fungsi untuk masking data MODIS LST yang tidak valid
function maskMODISLST(image) {
  var qc = image.select('QC_Day');
  var mask = qc.bitwiseAnd(3).eq(0); // Menggunakan 3 (desimal) sebagai pengganti 0b11
  return image.updateMask(mask);
}

// Fungsi untuk clip ke wilayah kajian
var clipToCol = function(image) {
  return image.clip(geometry);
};

// **1. Ambil dataset MODIS LST (1 km)**
var dataset = ee.ImageCollection('MODIS/061/MOD11A2')
                .map(clipToCol)
                .filterDate('2024-01-01', '2024-12-31')
                .filterBounds(geometry)
                .map(maskMODISLST); // Masking data MODIS LST yang tidak valid

var landSurfaceTemperature = dataset.select('LST_Day_1km').mean();

// **2. Ambil NDVI Sentinel-2 (10m)**
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')  // Gunakan Level-2A (Surface Reflectance)
 // Gunakan Level-2A (Surface Reflectance)
            .filterDate('2024-01-01', '2024-12-31')
            .filterBounds(geometry)
            .map(maskS2Clouds) // Masking awan pada Sentinel-2
            .map(function(image) {
              var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
              return ndvi.clip(geometry);
            }).median();

// **3. Ambil DEM SRTM untuk faktor ketinggian**
var dem = ee.Image('USGS/SRTMGL1_003').select('elevation').clip(geometry);

// **4. Normalisasi LST MODIS ke rentang [0,1]**
var lstMin = landSurfaceTemperature.reduceRegion({
  reducer: ee.Reducer.min(),
  geometry: geometry,
  scale: 1000,
  maxPixels: 1e13
}).getNumber('LST_Day_1km');

var lstMax = landSurfaceTemperature.reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: geometry,
  scale: 1000,
  maxPixels: 1e13
}).getNumber('LST_Day_1km');

var lstNorm = landSurfaceTemperature.expression(
  '(LST - minLST) / (maxLST - minLST)', {
    'LST': landSurfaceTemperature,
    'minLST': lstMin,
    'maxLST': lstMax
  }).rename('LST_Norm');

// **5. Regresi menggunakan NDVI & DEM**
var downscaledLST = lstNorm
                      .multiply(s2)
                      .add(dem.multiply(0.0001)) // Faktor kecil agar DEM tidak dominan
                      .rename('LST_HighRes');

// **6. Kembalikan ke suhu aslinya**
var lstFinal = downscaledLST.expression(
  '(LST * (maxLST - minLST)) + minLST', {
    'LST': downscaledLST,
    'minLST': lstMin,
    'maxLST': lstMax
  }).rename('LST_Downscaled');

// **7. Reduksi Noise dengan Focal Mean**
var lstSmoothed = lstFinal.focal_mean({
  radius: 3, // Radius smoothing
  units: 'pixels'
}).rename('LST_Smoothed');

// **8. Visualisasi LST hasil Downscaling (10m)**
var landSurfaceTemperatureVis = {
  min: 14000.0,
  max: 16000.0,
  palette: [
    '040274', '040281', '0502a3', '0502b8', '0502ce', '0502e6',
    '0602ff', '235cb1', '307ef3', '269db1', '30c8e2', '32d3ef',
    '3be285', '3ff38f', '86e26f', '3ae237', 'b5e22e', 'd6e21f',
    'fff705', 'ffd611', 'ffb613', 'ff8b13', 'ff6e08', 'ff500d',
    'ff0000', 'de0101', 'c21301', 'a71001', '911003'
  ],
};

Map.addLayer(lstSmoothed, landSurfaceTemperatureVis, 'Downscaled LST (10m)');

// **9. Export ke Google Drive dengan resolusi 10m**
Export.image.toDrive({
  image: lstSmoothed.clip(geometry).resample('bicubic'),
  maxPixels: 1e13,
  folder: 'GEE',
  scale: 30,  // Resolusi 10m
  description: 'LST-Downscaled-10m-2024',
  crs: 'EPSG:4326',
  formatOptions: {
    cloudOptimized: true
  }
});
