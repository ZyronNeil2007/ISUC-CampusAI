import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { SAMPLE_DIR } from '../helpers/sample-pack.mjs';
import { entrancePoint, findRoute, officesInBuilding, validateCampusMap } from '../../src/modules/campusMap.js';

const sampleMap = async () => YAML.parse(await readFile(`${SAMPLE_DIR}/campus-map.yml`, 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

test('the sample map is valid', async () => {
  assert.deepEqual(validateCampusMap(await sampleMap()), []);
});

test('validation reports what is wrong, all at once', async () => {
  const map = clone(await sampleMap());
  map.buildings[0].category = 'castle';
  map.buildings[1].id = map.buildings[0].id;
  map.buildings[2].x = 500;
  map.walkways.push(['library-building', 'nowhere']);
  map.walkways.push(['library-building', 'library-building']);
  const errors = validateCampusMap(map).join('\n');
  assert.match(errors, /category must be one of/);
  assert.match(errors, /duplicate id/);
  assert.match(errors, /outside the map area/);
  assert.match(errors, /pair of building or node ids that exist/);
  assert.match(errors, /connects a place to itself/);
});

test('a map needs a source, a status and buildings', () => {
  assert.ok(validateCampusMap({}).length >= 3);
  assert.deepEqual(validateCampusMap(null), ['the campus map must be an object']);
  assert.match(validateCampusMap({ title: 'x', width: 10, height: 10, verificationStatus: 'draft', buildings: [] }).join(), /source is missing/);
});

test('a missing accessibility note stays missing; an empty one is rejected', async () => {
  const map = clone(await sampleMap());
  map.buildings[0].accessibility = '   ';
  assert.match(validateCampusMap(map).join(), /accessibility must be text/);
});

test('findRoute follows the drawn walkways and names the places on the way', async () => {
  const map = await sampleMap();
  const route = findRoute(map, 'administration-building', 'technology-building');
  assert.deepEqual(route.ids, ['administration-building', 'north-walk', 'central-quad', 'east-walk', 'technology-building']);
  assert.deepEqual(route.via, ['Administration Building', 'Central quadrangle', 'Technology Building']);
  assert.deepEqual(route.points[0], entrancePoint(map.buildings[0]));
});

test('routes work in both directions and to the same place', async () => {
  const map = await sampleMap();
  const there = findRoute(map, 'library-building', 'student-services-building');
  const back = findRoute(map, 'student-services-building', 'library-building');
  assert.deepEqual([...there.ids].reverse(), back.ids);
  assert.deepEqual(findRoute(map, 'library-building', 'library-building').ids, ['library-building']);
});

test('no route is invented when places are not connected or unknown', async () => {
  const map = clone(await sampleMap());
  map.walkways = map.walkways.filter(([a, b]) => ![a, b].includes('sample-gymnasium'));
  assert.equal(findRoute(map, 'library-building', 'sample-gymnasium'), null);
  assert.equal(findRoute(map, 'library-building', 'unknown'), null);
});

test('the shorter of two walkways is chosen', () => {
  const map = {
    buildings: [
      { id: 'a', name: 'A', x: 0, y: 0, w: 2, h: 2, entrance: [1, 1] },
      { id: 'b', name: 'B', x: 20, y: 0, w: 2, h: 2, entrance: [21, 1] },
    ],
    nodes: [
      { id: 'long', label: 'Far corner', x: 10, y: 40 },
      { id: 'short', label: 'Near corner', x: 10, y: 2 },
    ],
    walkways: [['a', 'long'], ['long', 'b'], ['a', 'short'], ['short', 'b']],
  };
  assert.deepEqual(findRoute(map, 'a', 'b').via, ['A', 'Near corner', 'B']);
});

test('offices are matched to a building only when their location names it', async () => {
  const map = await sampleMap();
  const offices = [
    { name: 'Registrar', location: 'Administration Building ground floor' },
    { name: 'Clinic', location: 'Student Services Building ground floor' },
    { name: 'Mystery', location: 'Somewhere' },
    { name: 'No location' },
  ];
  assert.deepEqual(officesInBuilding(map.buildings[0], offices).map((o) => o.name), ['Registrar']);
  assert.deepEqual(officesInBuilding(map.buildings[2], offices), []);
});
