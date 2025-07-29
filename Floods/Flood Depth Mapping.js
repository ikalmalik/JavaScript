//AOI
var outline = ee.Image().byte().paint({
  featureCollection: geometry,
  color: 1,
  width: 2
});
Map.addLayer(outline, {palette: ['Black']}, "Area Studi");
var geometry = geometry;

var clipToCol = function(image){
  return image.clip(geometry);
};
Map.centerObject(geometry, 12);

var jrc = imageCollection
.filterBounds(geometry)

print(jrc.aggregate_array('return_period'))

var flood_10 = jrc
.filterBounds(geometry)
.filter(ee.Filter.eq('return_period', 10)).mosaic()

print(flood_10)

Map.addLayer(flood_10.clip(geometry),{palette:['skyblue', 'blue', 'darkblue']}, 'flood10', false)

print(
  ui.Chart.image.histogram(flood_10, geometry, 1000)
  )


var flood_20 = jrc
.filterBounds(geometry)
.filter(ee.Filter.eq('return_period', 20)).mosaic()

Map.addLayer(flood_20.clip(geometry), {palette:['skyblue', 'blue', 'darkblue']}, 'flood20', false)


var flood_100 = jrc
.filterBounds(geometry)
.filter(ee.Filter.eq('return_period', 100)).mosaic()

Map.addLayer(flood_100.clip(geometry), {palette:['skyblue', 'blue', 'darkblue']}, 'flood100', false)

Export.image.toDrive({
  image: flood_10.clip(geometry), 
  description: 'flood10_iran', 
  region: geometry, 
  scale: 1000, 
  crs: 'EPSG:4326', 
  folder: 'test', 
  maxPixels: 1e13
  })

// var depthVis = {
//   min: 0,
//   max: 1,
//   palette: ['ffffff','0000ff'],
// };

// Map.addLayer(jrc,depthVis, 'flood_depth',true)
