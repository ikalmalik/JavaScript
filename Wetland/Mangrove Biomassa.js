print('This script purpose is to:');

// Define region of interest
var roi = geometry;
Map.centerObject(roi, 10);

// Define the list of years for analysis
var years = [2019, 2020, 2021, 2022, 2023];

// Define bands for predicting biomass
var bands = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];

// Visualization parameter for multispectral imagery in false color nir-swir1-swir2
var visFalseColor = {
  min: [0.1, 0.075, 0.05],
  max: [0.5, 0.4, 0.3],
  bands: ['B8', 'B11', 'B12']
};

// Visualization parameter for biomass
var visBiomass = { min: 0, max: 300, palette: ['lightyellow', 'lightgreen', 'green', 'darkgreen' ]};

// Palette for NDWI and MNDWI2
var paletteIndicesWater = ['red', 'pink', 'white', 'lightskyblue', 'blue'];

// Indices formula list
var indicesProp = [
  { name: 'NDMI', formula: 'NDMI = (NIR - SWIR1) / (NIR + SWIR1)', min: -0.2, max: 0.55, palette: paletteIndicesWater },
  { name: 'MNDWI', formula: 'MNDWI = (GREEN - SWIR1) / (GREEN + SWIR1)', min: -0.6, max: 0.55, palette: paletteIndicesWater },
];

// // Mangrove loss visualization
// var mangroveLossLabel = [
//   'Mangrove loss 2019 - 2020',
//   'Mangrove loss 2020 - 2021',
//   'Mangrove loss 2021 - 2022',
//   'Mangrove loss 2022 - 2023',
//   'Current mangrove 2023',
// ];
// var mangroveLossPalette = ['FFFFE0', 'FFD700', 'FF4500', '8B0000', '228B22'];

// // Mangrove loss visualization
// var mangroveGainLabel = [
//   'Mangrove in 2019',
//   'Mangrove gain 2019 - 2020',
//   'Mangrove gain 2020 - 2021',
//   'Mangrove gain 2021 - 2022',
//   'Mangrove gain 2022 - 2023',
// ];
// var mangroveGainPalette = ['228B22', 'F0FFFF', '87CEFA', '0000FF', '000080'];

// Image area for analysis
var area = ee.Image.pixelArea().multiply(1e-4);

// Show legend of AGB
legendGradient('AGB (C Ton/Ha)', visBiomass, 'bottom-left');

// Run image composite and filter gedi data per year
var data = years.map(function(year){
  // Define start and end date for filtering collection
  var start = year + '-01-01';
  var end = year + '-12-31';
  
  // Filter sentinel-2 collection
  var s2Col = s2.filterBounds(roi) // Filter by region
    .filterDate(start, end); // Filter by date
    
  // Filter sentinel-2 cloud score collection
  var cloudCol = cloud.filterBounds(roi) // Filter by region
    .filterDate(start, end); // Filter by date
    
  // Combine collection, cloud mask, and make median composite
  var image = s2Col.linkCollection(cloudCol, 'cs')
    .map(cloudMask) // Apply cloud mask function
    .median() // Develop median composite
    .toFloat() // Convert to float
    .clip(roi); // Clip image with roi
  
  // Show image
  Map.addLayer(image, visFalseColor, 'S2 False Color ' + year, false);
  
  // Band map for calculating index
  var bandMap = {
    BLUE: image.select('B2'),
    GREEN: image.select('B3'),
    RED: image.select('B4'),
    NIR: image.select('B8'),
    SWIR1: image.select('B11'),
    SWIR2: image.select('B12'),
  };
  
  // Create indices
  var indices = ee.Image(indicesProp.map(function(prop){
    var imageIndices = image.expression(prop.formula, bandMap).toFloat(); // Create index and conver to float
    
    // Show image index
    // Map.addLayer(imageIndices, { min: prop.min, max: prop.max, palette: prop.palette }, prop.name + ' ' + year, false);
    
    return imageIndices;
  }));
  
  // Classify mangrove from indices
  var water = indices.select('MNDWI').gte(0);
  var mangrove = indices.select('NDMI').gte(0.5)
    .and(water.eq(0))
    .toByte()
    .selfMask()
    .rename('mangrove');
  Map.addLayer(mangrove, { palette: 'indigo' }, 'Mangrove ' + year, false);
  
  // Mask image with mangrove cover
  // image = image.updateMask(mangrove);
  
  // Calculate mangrove area
  var mangroveArea = ee.Number(area.updateMask(mangrove).reduceRegion({
    scale: 100,
    maxPixels: 1e13,
    reducer: ee.Reducer.sum(),
    geometry: roi
  }).get('area')).toInt();
  
  // Only sample if it is not 2024
  // Filter GEDI biomass data
  var gediData = gedi.filterBounds(roi) // Filter by region
    .filterDate(start, end) // Filter by date
    .map(gediMask) // Filter and mask bad data
    .median() // Create median composite
    .toFloat() // Convert to float
    .clip(roi); // Clip with region

  // Show gedi data
  Map.addLayer(gediData, visBiomass, 'GEDI Biomass ' + year, false);
  
  // Sample it
  var sample = image.addBands(gediData) // Add gedi data to image for sample
    .updateMask(gediData.lt(500)) // Mask s2 image with gedi data
    .sample({ // Sample it
      scale: 25, // With 25 meter resolution
      region: roi, // Under the region
    });
  
  return {
    image: image.set('year', year),
    mangrove: mangrove,
    sample: sample || ee.FeatureCollection([]),
    year: year,
    mangrove_area: mangroveArea
  };
});

// Collect all the sample
var samples = ee.FeatureCollection(data.map(function(prop){ return prop.sample })).flatten()
  .randomColumn(); // Apply random column for splitting data

// Train and test data
var train = samples.filter(ee.Filter.lte('random', 0.9));
var test = samples.filter(ee.Filter.gt('random', 0.9));
print(ee.String('Train sample size: ').cat(train.size()), ee.String('Test sample size: ').cat(test.size()));

// Develop model
var model = ee.Classifier.smileRandomForest(50) // Create random forest classifier with 50 trees
  .setOutputMode('REGRESSION') // Make it into a regression
  .train(train, 'AGB', bands); // Train it with
  
// Check model feature importances
var importance = ee.Dictionary(model.explain().get('importance'));
var sumImportance = importance.values().reduce(ee.Reducer.sum());
var importanceRelative = importance.map(function(key, value){ return ee.Number(value).divide(sumImportance).multiply(100) });
print('Model Relative Feature Importances', importanceRelative);

// Asses model with 1:1 plot
var testApply = test.classify(model, 'prediction').map(function(feat){ return feat.set('line', feat.get('AGB'))});
var chart = ui.Chart.feature.byFeature(testApply, 'AGB', ['prediction', 'line']) // Make a chart
  .setChartType('ScatterChart') // Set chart as scatter chart
  .setOptions({
    title: 'AGB Reference vs Prediction',
    hAxis: { title: 'Reference AGB (C Ton/Ha)' },
    vAxis: { title: 'Prediction AGB (C Ton/Ha)' },
    dataOpacity: 0.3,
    series: [
      { color: 'blue' },
      { pointsVisible: false, visibleInLegend: false }
    ],
    trendlines: [
      { color: 'blue', showR2: true, visibleInLegend: true },
      { color: 'red', visibleInLegend: false }
    ]
  });
print(chart);

// Apply model to each year
var images = ee.ImageCollection(data.map(function(prop){
  var year = prop.year;
  var image = prop.image;
  var mangrove = prop.mangrove;
  var mangroveArea = prop.mangrove_area;
  
  // Apply model to image
  var agb = image.updateMask(mangrove) // Mask with mangrove cover
    .classify(model, 'AGB')
    .toFloat();
  
  // Show AGB from model
  Map.addLayer(agb, visBiomass, 'AGB ' + year);
  
  // Calculate AGB total
  var agbTotal = ee.Number(agb.multiply(area).reduceRegion({
    scale: 100,
    maxPixels: 1e13,
    geometry: roi,
    reducer: ee.Reducer.sum()
  }).get('AGB'));
  
  return ee.Image([
    agb,
    mangrove.multiply(year).rename('mangrove_year').toInt()
  ]).set({
    year: year,
    agb: agbTotal,
    yearString: String(year),
    mangrove_area: mangroveArea
  });
}));

// // Mangrove change map
// var mangroveLoss = images.select('mangrove_year').max().rename('mangrove_loss')
//   .set({
//     mangrove_loss_class_values: years,
//     mangrove_loss_class_palette: mangroveLossPalette
//   });
// Map.addLayer(mangroveLoss, {}, 'Mangrove Loss 2019 - 2023');
// legendDiscrete(mangroveLossPalette, mangroveLossLabel, 'Mangrove Loss 2019 - 2023', 'bottom-left');
  
// var mangroveGain = images.select('mangrove_year').min().rename('mangrove_gain')
//   .set({
//     mangrove_gain_class_values: years,
//     mangrove_gain_class_palette: mangroveGainPalette
//   });
// Map.addLayer(mangroveGain, {}, 'Mangrove Gain 2019 - 2023');
// legendDiscrete(mangroveGainPalette, mangroveGainLabel, 'Mangrove Gain 2019 - 2023', 'bottom-left');

// Mangrove change chart
var mangroveChart = ui.Chart.feature.byFeature(images, 'yearString', ['mangrove_area'])
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Mangrove Cover 2019 - 2023',
    hAxis: { title: 'Year' },
    vAxis: { title: 'Mangrove area (Ha)', minValue: 0 },
    series: [
      { color: 'indigo' }
    ]
  });
print(mangroveChart);

// AGB trend map
var agbFirst = images.select('AGB').first();
var agbLast = images.sort('year', false).select('AGB').first();
var agbTrend = agbLast.subtract(agbFirst).divide(years.length);
var agbTrendPercent = agbTrend.divide(agbFirst).multiply(100);
Map.addLayer(agbTrend, { min: -10, max: 10, palette: ['red', 'orange', 'lightyellow', 'lightskyblue', 'blue'] }, 'AGB Trend in +/- Ton/year 2019 - 2023');
legendGradient('AGB Trend (Ton/Year)', { min: -10, max: 10, palette: ['red', 'orange', 'lightyellow', 'lightskyblue', 'blue'] }, 'bottom-right');
Map.addLayer(agbTrendPercent, { min: -2.5, max: 2.5, palette: ['red', 'orange', 'lightyellow', 'lightskyblue', 'blue'] }, 'AGB Trend in +/- %/year 2019 - 2023');
legendGradient('AGB Trend (%/Year)', { min: -2.5, max: 2.5, palette: ['red', 'orange', 'lightyellow', 'lightskyblue', 'blue'] }, 'bottom-right');

// AGB change chart
var agbChart = ui.Chart.feature.byFeature(images, 'yearString', ['agb'])
  .setChartType('ColumnChart')
  .setOptions({
    title: 'AGB 2019 - 2023',
    hAxis: { title: 'Year' },
    vAxis: { title: 'AGB (C Ton)', minValue: 0 },
    series: [
      { color: 'forestgreen' }
    ]
  });
print(agbChart);

// Cloud mask function
function cloudMask(image){
  return image.select(bands) // Only select important bands
    .updateMask(image.select('cs').gt(0.6)) // Mask with cloud score above 0.6
    .multiply(1e-4); // Multiply by 0.0001 to make image value to be 0-1
}

// Function to mask bad data in gedi
function gediMask(image){
  return image.select(['agbd'], ['AGB']) // Select only AGB band
    .updateMask(image.select('degrade_flag').eq(0).and(image.select('l2_quality_flag')).and(image.select('l4_quality_flag'))); // Masked bad data
}

// Discrete panel legend
function legendDiscrete(palette, names, title, position){
  // Make a legend
  var panel = ui.Panel([ ui.Label(title, { fontWeight: 'bold', fontSize: 'small' }) ], ui.Panel.Layout.flow('vertical'), { position: position || 'bottom-left' });
  Map.add(panel);
  
  // Add legend list
  names.map(function(label, index){
    panel.add(ui.Panel(
      [
        ui.Label('', { backgroundColor: palette[index], width: '30px', height: '15px', border: 'thin solid black' }),
        ui.Label(label, { height: '15px', fontSize: 'smaller' })
      ],
    ui.Panel.Layout.flow('horizontal')
    ));
  });
}

// Legend function
function legendGradient(name, vis, position){
  var geom = ee.Geometry({
    "geodesic": false,
    "type": "Polygon",
    "coordinates": [
      [
        [
          112.38333164500061,
          -0.4965121527071768
        ],
        [
          112.45199619578186,
          -0.4965121527071768
        ],
        [
          112.45199619578186,
          0.011599308565035363
        ],
        [
          112.38333164500061,
          0.011599308565035363
        ],
        [
          112.38333164500061,
          -0.4965121527071768
        ]
      ]
    ]
  });
  
  var panel = ui.Panel([ui.Label(name, { fontWeight: 'bold', stretch: 'horizontal', textAlign: 'center' })], ui.Panel.Layout.flow('vertical'), { position: position, stretch: 'horizontal' });
  var lonLat = ee.Image.pixelLonLat().select('latitude').clip(geom);
  var minMax = lonLat.reduceRegion({
    scale: 1000,
    maxPixels: 1e13,
    reducer: ee.Reducer.minMax(),
    geometry: geom
  });
  var max = ee.Number(minMax.get('latitude_max'));
  var min = ee.Number(minMax.get('latitude_min'));
  var visualized = lonLat.visualize({ min: min, max: max, palette: vis.palette });
  var thumbnail = ui.Thumbnail(visualized, {}, null, { border: 'thin solid black', textAlign: 'center', stretch: 'horizontal', height: '200px', fontSize: 'smaller' });
  
  panel.add(ui.Label(vis.max, { textAlign: 'center', stretch: 'horizontal' }));
  panel.add(thumbnail);
  panel.add(ui.Label(vis.min, { textAlign: 'center', stretch: 'horizontal'}));
  Map.add(panel);
}

//Export Data
Export.image.toDrive({
  image: images.clip(roi),
  description: 'S2 False Color',
  scale: 30,
  region:roi
});
