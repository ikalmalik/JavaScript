// === STEP 1: AREA & CENTER MAP ===
var WaterBodyArea = geometry;
var outline = ee.Image().byte().paint({featureCollection: WaterBodyArea, color: 1, width: 2.8});
Map.addLayer(outline, {palette: ['Red']}, "Outline Area Studi");
Map.centerObject(WaterBodyArea, 13);
Map.addLayer(WaterBodyArea, {}, 'Area Studi', false);
var clipToCol = function(image){ return image.clip(WaterBodyArea); };

// === STEP 2: TIME RANGE ===
var Startyear = '2024-01-01';
var Endyear = '2024-12-31';

// === STEP 3: SENTINEL-2 & INDEX CALCULATION ===
var sentinelCollection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterDate(Startyear, Endyear)
  .filterBounds(WaterBodyArea)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(function(image){
    var b = image.select('B.*').multiply(0.0001);
    var ndwi = b.normalizedDifference(['B3', 'B8']).rename('NDWI');
    var mask = ndwi.gt(0.1);
    var ndci = b.normalizedDifference(['B5', 'B4']).rename('NDCI');
    var ndti = b.normalizedDifference(['B4', 'B3']).rename('NDTI');
    var tssLiu = b.select('B7').pow(1.357).multiply(2950).rename('TSS_Liu');
    var tssBudhiman = b.select('B4').multiply(0.94 * 27.704).exp().multiply(8.1429).rename('TSS_Budhiman');
    var tssPrasetyo = b.select('B3').add(b.select('B4')).multiply(12.543).exp().multiply(3.7321).rename('TSS_Prasetyo');
    return image
      .addBands(ndwi.updateMask(mask))
      .addBands(ndci.updateMask(mask))
      .addBands(ndti.updateMask(mask))
      .addBands(tssLiu.updateMask(mask))
      .addBands(tssBudhiman.updateMask(mask))
      .addBands(tssPrasetyo.updateMask(mask))
      .copyProperties(image, ['system:time_start']);
  });

// === STEP 4: COMPOSITE & LAYER VISUALIZATION ===
function addLayer(band, vis, name, shown){
  var img = sentinelCollection.select(band).mean().clip(WaterBodyArea);
  Map.addLayer(img, vis, name, shown);
  return img;
}
var ndwiComposite = addLayer('NDWI', {min: -1, max: 1, palette: ['red', 'blue', 'white']}, 'NDWI', true);
var ndciComposite = addLayer('NDCI', {min: -1, max: 1, palette: ['red', 'yellow', 'blue']}, 'NDCI', false);
var ndtiComposite = addLayer('NDTI', {min: -1, max: 1, palette: ['white', 'orange', 'brown']}, 'NDTI', false);
var tssLiuComposite = addLayer('TSS_Liu', {min: 0, max: 100, palette: ['blue', 'yellow', 'red']}, 'TSS Liu', false);
var tssBudhimanComposite = addLayer('TSS_Budhiman', {min: 0, max: 100, palette: ['blue', 'green', 'red']}, 'TSS Budhiman', false);
var tssPrasetyoComposite = addLayer('TSS_Prasetyo', {min: 0, max: 100, palette: ['white', 'orange', 'brown']}, 'TSS Prasetyo', false);

// === STEP 5: TIME SERIES CHARTS ===
function createChart(band, title){
  return ui.Chart.image.series({
    imageCollection: sentinelCollection.select(band),
    region: WaterBodyArea,
    reducer: ee.Reducer.mean(),
    scale: 10,
    xProperty: 'system:time_start'
  }).setOptions({title: title, vAxis: {title: band}, hAxis: {title: 'Date'}, lineWidth: 2, pointSize: 2});
}
print(createChart('NDWI', 'WATER INDEX (NDWI) TIME SERIES'));
print(createChart('NDCI', 'CHLOROPHYLL INDEX (NDCI) TIME SERIES'));
print(createChart('NDTI', 'TURBIDITY INDEX (NDTI) TIME SERIES'));

// === STEP 6: EXPORT IMAGES ===
function exportImage(image, name){
  Export.image.toDrive({
    image: image.clip(WaterBodyArea),
    description: name,
    scale: 10,
    region: WaterBodyArea,
    maxPixels: 1e13,
    crs: 'EPSG:4326',
    fileFormat: 'GeoTIFF',
    folder: 'GEE',
    formatOptions: {cloudOptimized: true}
  });
}
exportImage(ndwiComposite, 'NDWI_DP_2024');
exportImage(ndciComposite, 'NDCI_DP_2024');
exportImage(ndtiComposite, 'NDTI_DP_2024');
exportImage(tssLiuComposite, 'TSS_Liu_DP_2024');
exportImage(tssBudhimanComposite, 'TSS_Budhiman_DP_2024');
exportImage(tssPrasetyoComposite, 'TSS_Prasetyo__DP_2024');

// === STEP 7: EXPORT TIME SERIES TO CSV ===
function exportCSV(band, desc){
  var series = sentinelCollection.map(function(image){
    var stats = image.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: WaterBodyArea,
      scale: 10,
      bestEffort: true
    });
    return ee.Feature(null, {
      'system:time_start': image.get('system:time_start'),
      [band]: stats.get(band)
    });
  });
  Export.table.toDrive({
    collection: series,
    description: desc,
    fileFormat: 'CSV'
  });
}
exportCSV('NDCI', 'NDCI_Time_Series_Export');
exportCSV('NDTI', 'NDTI_Time_Series_Export');
exportCSV('TSS_Liu', 'TSS_Liu_Time_Series_Export');
exportCSV('TSS_Budhiman', 'TSS_Budhiman_Time_Series_Export');
exportCSV('TSS_Prasetyo', 'TSS_Prasetyo_Time_Series_Export');
