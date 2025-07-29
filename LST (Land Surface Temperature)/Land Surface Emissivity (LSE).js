var aoi = roi;
           // .filter(ee.Filter.eq('dt_code', 527));
var outline = ee.Image().byte().paint({
  featureCollection: roi,
  color: 1,
  width: 2.5
});
Map.addLayer(outline, {palette: ['Black']}, "Area Studi");
var clipToCol = function(image){
  return image.clip(roi);
};
            
Map.centerObject(roi, 9.5);

// Load Sentinel-2 Image Collection (Surface Reflectance)
var sentinel = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                .filterBounds(roi)
                .filterDate('2023-01-01', '2024-12-31') // Time period
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10)); // Remove cloudy images

// Function to compute NDVI
var computeNDVI = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return image.addBands(ndvi).set('system:time_start', image.get('system:time_start')); // Keep time info
};

// Apply NDVI function to each image
var ndviCollection = sentinel.map(computeNDVI);

// Function to compute Emissivity
var computeEmissivity = function(image) {
  var ndvi = image.select('NDVI');
  var emissivity = ndvi.expression(
    "(NDVI < 0.2) ? 0.97 : (NDVI > 0.5) ? 0.99 : (0.004 * NDVI + 0.986)", 
    { 'NDVI': ndvi }
  ).rename('Emissivity');
  return image.addBands(emissivity);
};

// Apply emissivity function
var emissivityCollection = ndviCollection.map(computeEmissivity);

// Generate 16-day interval time series
var startDate = ee.Date('2023-01-01');
var endDate = ee.Date('2024-12-31');
var interval = 16; // 16-day temporal resolution

var timeSeries = ee.ImageCollection(
  ee.List.sequence(0, endDate.difference(startDate, 'day').subtract(interval), interval).map(function(dayOffset) {
    var start = startDate.advance(dayOffset, 'day');
    var end = start.advance(interval, 'day');
    var filtered = emissivityCollection.filterDate(start, end);
    return filtered.mean().set('date', start.format('YYYY-MM-dd'));
  })
);

// Generate Time-Series Chart
var chart = ui.Chart.image.series({
  imageCollection: timeSeries.select(['NDVI', 'Emissivity']),
  region: roi,
  reducer: ee.Reducer.mean(),
  scale: 1000,
  xProperty: 'date'
}).setOptions({
  title: '16-Day Time Series of NDVI & Emissivity (2023)',
  hAxis: {title: 'Date', format: 'YYYY-MM-dd', gridlines: {count: 10}},
  vAxis: {title: 'Value'},
  series: {
    0: {color: 'green', label: 'NDVI'},
    1: {color: 'red', label: 'Emissivity'}
  }
});

// Print chart to the console
print(chart);

// Visualization parameters
var visParamsNDVI = { min: -1, max: 1, palette: ['blue', 'white', 'green'] };
var visParamsEmissivity = { min: 0.97, max: 0.99, palette: ['blue', 'yellow', 'red'] };

// Compute the median emissivity (single band)
var medianEmissivity = emissivityCollection.select('Emissivity').median();

// Add emissivity visualization to the map (Fixed issue: now single band)
Map.addLayer(medianEmissivity.clip(roi), visParamsEmissivity, 'Median Emissivity');

// Export emissivity image
Export.image.toDrive({
  image: medianEmissivity,
  description: 'Sentinel2_Emissivity',
  scale: 30,
  region: roi,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e13
});

// Function to add a legend for Emissivity
function addLegend() {
  var legend = ui.Panel({ style: { position: 'bottom-left', padding: '8px 15px' } });
  var title = ui.Label({
    value: 'Emissivity Legend',
    style: { fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0', padding: '0' }
  });

  var colors = ['blue', 'yellow', 'red'];
  var labels = ['Low (<0.97)', 'Medium (0.97 - 0.98)', 'High (>0.98)'];

  var list = ui.Panel({ layout: ui.Panel.Layout.flow('vertical') });

  for (var i = 0; i < colors.length; i++) {
    var colorBox = ui.Label({ style: { backgroundColor: colors[i], padding: '8px', margin: '4px' } });
    var description = ui.Label({ value: labels[i], style: { margin: '4px 0 4px 6px' } });
    var row = ui.Panel({ widgets: [colorBox, description], layout: ui.Panel.Layout.flow('horizontal') });
    list.add(row);
  }

  legend.add(title);
  legend.add(list);
  Map.add(legend);
}

// Call the function to add the legend
addLegend();
