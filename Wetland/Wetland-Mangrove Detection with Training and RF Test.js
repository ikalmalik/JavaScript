var aoi = aoi;
var outline = ee.Image().byte().paint({featureCollection: aoi, color: 1, width: 2.8});
Map.addLayer(outline, {palette: ['Red']}, "Area Studi");
var clipToCol = function(image){ return image.clip(aoi); };
Map.centerObject(aoi, 11);

var l9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2");
var l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2");

var landsat8 = l8.filterBounds(aoi).filterDate('2024-01-01', '2024-12-31');
var landsat9 = l9.filterBounds(aoi).filterDate('2024-01-01', '2024-12-31');
var image = landsat8.merge(landsat9).map(cloudMaskLandsat).median().multiply(0.0000275).add(-0.2).clip(aoi);

function cloudMaskLandsat(image){
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 1).eq(0)
    .and(qa.bitwiseAnd(1 << 2).eq(0))
    .and(qa.bitwiseAnd(1 << 3).eq(0))
    .and(qa.bitwiseAnd(1 << 4).eq(0));
  return image.updateMask(mask);
}

var ndvi = image.expression('(NIR - Red) / (NIR + Red)', {'NIR': image.select('SR_B5'),'Red': image.select('SR_B4')});
var mndwi = image.expression('(Green - SWIR) / (Green + SWIR)', {'SWIR': image.select('SR_B6'),'Green': image.select('SR_B3')});
var andwi = image.expression('(Blue + Green + Red - NIR - SWIR1 - SWIR2) / (Blue + Green + Red + NIR + SWIR1 + SWIR2)',{
  'SWIR1': image.select('SR_B6'),'SWIR2': image.select('SR_B7'),'Green': image.select('SR_B3'),'Red': image.select('SR_B4'),'Blue': image.select('SR_B2'),'NIR': image.select('SR_B5')});
var savi = image.expression('((NIR - Red) / (NIR + Red +0.5)) * (1.0+0.5)', {'NIR': image.select('SR_B5'),'Red': image.select('SR_B4')});
var arvi = image.expression('(NIR - (Red - (1 * (Red - Blue)))) / (NIR + (Red - (1 * (Red - Blue))))', {'NIR': image.select('SR_B5'),'Red': image.select('SR_B4'),'Blue': image.select('SR_B2')});
var gndvi = image.expression('(NIR - Green) / (NIR + Green)', {'Green': image.select('SR_B3'),'NIR': image.select('SR_B5')});
var slavi = image.expression('(NIR) / (Red + SWIR)', {'NIR': image.select('SR_B5'),'Red': image.select('SR_B4'),'SWIR': image.select('SR_B6')});
var ndbi = image.expression('(SWIR1- NIR) / (SWIR1 + NIR)', {'SWIR1': image.select('SR_B6'),'NIR': image.select('SR_B5')});
var evi = image.expression('((NIR - Red) / ((NIR + 6) * (Red - 7.5) * (Blue + 1))) * 2.5', {'NIR': image.select('SR_B5'),'Red': image.select('SR_B4'),'Blue': image.select('SR_B2')});
var ibi = image.expression('(((SWIR / (SWIR * NIR)) * 2) - ((NIR / (NIR + Red)) + (Green/(Green + SWIR)))) / (((SWIR / (SWIR * NIR)) * 2) + ((NIR / (NIR + Red)) + (Green/(Green + SWIR))))', {
  'SWIR': image.select('SR_B6'),'NIR': image.select('SR_B5'),'Red': image.select('SR_B4'),'Green': image.select('SR_B3')});
var ndwi = image.expression('(Green - NIR) / (Green + NIR)', {'NIR': image.select('SR_B5'),'Green': image.select('SR_B3')});
var rvi = image.expression('(NIR / Red)', {'NIR': image.select('SR_B5'),'Red': image.select('SR_B4')});
var lswi = image.expression('(NIR - SWIR) / (NIR + SWIR)', {'NIR': image.select('SR_B5'),'SWIR': image.select('SR_B7')});

var final_image = image.addBands(ndvi.rename('NDVI')).addBands(mndwi.rename('MNDWI')).addBands(andwi.rename('ANDWI'))
  .addBands(savi.rename('SAVI')).addBands(arvi.rename('ARVI')).addBands(gndvi.rename('GNDVI'))
  .addBands(slavi.rename('SLAVI')).addBands(ndbi.rename('NDBI')).addBands(evi.rename('EVI'))
  .addBands(ibi.rename('IBI')).addBands(ndwi.rename('NDWI')).addBands(rvi.rename('RVI')).addBands(lswi.rename('LSWI'));

var bands = ['NDVI','NDWI','SAVI','EVI','IBI','ARVI','SLAVI','NDBI','ANDWI','GNDVI','RVI','LSWI'];

var trainingPoly = mgv.merge(nmgv);
var training = final_image.select(bands).sampleRegions({collection: trainingPoly, properties: ['Landuse','GEE'], scale: 30});
var classifier_rf = ee.Classifier.smileRandomForest(10).train({features: training, classProperty: 'GEE', inputProperties: bands});
var classified_rf = final_image.select(bands).classify(classifier_rf);

var exp = classifier_rf.explain();
var importance = ee.Dictionary(exp.get('importance'));
var keys = importance.keys().sort(importance.values()).reverse();
var values = importance.values(keys);
var rows = keys.zip(values).map(function(list) { return {c: ee.List(list).map(function(n) { return {v: n}; })} });

var dataTable = {
  cols: [{id: 'band', label: 'Band', type: 'string'},{id: 'importance', label: 'Importance', type: 'number'}],
  rows: rows
};

ee.Dictionary(dataTable).evaluate(function(result) {
  var chart = ui.Chart(result).setChartType('ColumnChart').setOptions({
    title: 'Tahun 2024',
    legend: {position: 'none'},
    hAxis: {title: 'Bands'},
    vAxis: {title: 'Importance'}
  });
  print(chart);
});

Map.addLayer(image, {bands: ['SR_B5', 'SR_B6', 'SR_B2'], min: 0, max: [0.5, 0.3, 0.2]}, 'Landsat 562');
Map.addLayer(image, {bands: ['SR_B7', 'SR_B5', 'SR_B2'], min: 0, max: [0.5, 0.3, 0.2]}, 'Landsat 752');
Map.addLayer(final_image.select('NDVI'), {min: -1, max: 1, palette: ['#000000','#654321','#FFFF00','#ADFF2F','#006400']}, 'NDVI', false);
Map.addLayer(final_image.select('ANDWI'), {min: -1, max: 1, palette: ['#ffffff','#cccccc','#00ffff','#0000ff']}, 'ANDWI', false);
Map.addLayer(classified_rf.clip(aoi), {min: 0, max: 6, palette: ['blue','#ff1b0e','#edff04','#00ff0b','#0f920b','#1cffbd']}, 'RF Classification');

var validation = val_mgv.merge(val_nmgv);
var validasi = classified_rf.sampleRegions({collection: validation, properties: ['GEE'], scale: 30});
var akurasi = validasi.errorMatrix('GEE', 'classification');
print('Confusion matrix', akurasi);
print('Overall accuracy: ', akurasi.accuracy());
print('Koefisien Kappa: ', akurasi.kappa());
print('User Accuracy: ', akurasi.producersAccuracy());
print('Producer Accuracy: ', akurasi.consumersAccuracy());

Export.image.toDrive({image: classified_rf.clip(aoi), description: 'RF-Klasifikasi-WIL1', scale : 30, maxPixels: 1e13, region: aoi, crs:'EPSG:4326', fileFormat: 'GeoTIFF', folder: 'GEE', formatOptions: { cloudOptimized: true }});
