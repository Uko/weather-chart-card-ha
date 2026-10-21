import assert from 'node:assert/strict';
import { test } from 'node:test';

// main.js registers itself on `window`; Lit's Node build shims the DOM classes.
globalThis.window = globalThis;
const { default: WeatherChartCard } = await import('../src/main.js');
const { DEFAULTS, FORECAST_DEFAULTS, configValue } = await import('../src/defaults.js');

// A card with config and hass applied, without rendering it.
function makeCard(config = {}, hass = {}) {
  const card = new WeatherChartCard();
  card.setConfig({ entity: 'weather.home', ...config });
  card._hass = {
    states: {},
    config: { time_zone: 'UTC', unit_system: { length: 'km', temperature: '°C' } },
    ...hass,
  };
  return card;
}

test('#1 turning autoscroll on starts the timer, turning it off cancels it', async () => {
  const card = makeCard({ autoscroll: true });
  const calls = [];
  card.autoscroll = () => calls.push('start');
  card.cancelAutoscroll = () => calls.push('cancel');
  card.drawChart = () => {};
  card.subscribeForecastEvents = () => {};
  card.unsubscribeForecastEvents = () => {};
  card._forecastSubscriptionKey = 'weather.home|daily';
  // updated() awaits updateComplete, which only settles once the card is connected.
  card.getUpdateComplete = async () => true;

  await card.updated(new Map([['config', { ...card.config, autoscroll: false }]]));
  card.config = { ...card.config, autoscroll: false };
  await card.updated(new Map([['config', { ...card.config, autoscroll: true }]]));
  assert.deepEqual(calls, ['start', 'cancel']);
});

test('#2 weekday and month follow the card timezone, not the browser', () => {
  const card = makeCard({ locale: 'en' });
  // 23:30 UTC on Saturday 31 October is already Sunday 1 November in Tokyo.
  const instant = new Date('2026-10-31T23:30:00Z');
  assert.deepEqual(card.getZonedDateIndices(instant, 'Asia/Tokyo'), { dayIndex: 0, monthIndex: 10 });
  assert.deepEqual(card.getZonedDateIndices(instant, 'America/Los_Angeles'), { dayIndex: 6, monthIndex: 9 });
  assert.equal(card.getLocalizedDayNameFull(instant, 'Asia/Tokyo'), 'Sunday');
  assert.equal(card.getLocalizedMonthName(instant, 'Asia/Tokyo'), 'November');
  assert.equal(card.getLocalizedMonthNameShort(instant, 'America/Los_Angeles'), 'OCT');
});

test('#3 autoscroll drops past slots before limiting the column count', () => {
  const card = makeCard({ autoscroll: true, forecast: { type: 'hourly' } });
  const hour = 60 * 60 * 1000;
  const now = Date.now();
  card.forecasts = [-3, -2, 0, 1, 2, 3].map((h) => ({ datetime: new Date(now + h * hour).toISOString(), temperature: 10 }));
  const visible = card.getVisibleForecast(3);
  assert.equal(visible.length, 3);
  assert.equal(visible[0], card.forecasts[2]);
  // The chart is built from the same slice as the icon and wind rows.
  assert.deepEqual(card.computeForecastData({ config: card.config, forecastItems: 3 }).forecast, visible);
});

test('#4 missing or unavailable alternative sensors fall back to the weather entity', () => {
  const card = makeCard();
  const hass = { states: {
    'sensor.ok': { state: '21.5', attributes: {} },
    'sensor.down': { state: 'unavailable', attributes: {} },
  } };
  assert.equal(card.readSensorState(hass, 'sensor.ok', 10), '21.5');
  assert.equal(card.readSensorState(hass, 'sensor.down', 10), 10);
  assert.equal(card.readSensorState(hass, 'sensor.renamed', 10), 10);
  assert.equal(card.readSensorState(hass, undefined, 10), 10);
});

test('#5 #13 the stub and the card share one set of defaults', () => {
  const stub = WeatherChartCard.getStubConfig({}, ['weather.home'], ['weather.home']);
  assert.equal(stub.entity, 'weather.home');
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (typeof value !== 'object') assert.equal(stub[key], value, key);
  }
  assert.deepEqual(stub.forecast, FORECAST_DEFAULTS);
  assert.equal(typeof stub.forecast.labels_font_size, 'number');
  assert.equal(makeCard().config.show_feels_like, false);
  // The editor reads absent keys from the same defaults.
  assert.equal(configValue({}, 'show_feels_like'), false);
  assert.equal(configValue({}, 'animated_icons'), true);
  assert.equal(configValue({ forecast: {} }, 'forecast.show_wind_forecast'), true);
  assert.equal(configValue({ forecast: { round_temp: true } }, 'forecast.round_temp'), true);
});

test('#7 Norwegian resolves through both nb and no', () => {
  assert.notEqual(makeCard({ locale: 'nb' }).ll('daily'), makeCard({ locale: 'en' }).ll('daily'));
  assert.equal(makeCard({ locale: 'no' }).ll('daily'), makeCard({ locale: 'nb' }).ll('daily'));
  assert.equal(makeCard({ locale: 'no' }).getLocaleArray('days')[0], makeCard({ locale: 'nb' }).getLocaleArray('days')[0]);
});

test('#10 precipitation bars use the display unit, with a matching axis ceiling', () => {
  const card = makeCard({ units: { precipitation: 'mm' } }, {
    states: { 'weather.home': { state: 'rainy', attributes: { precipitation_unit: 'in', supported_features: 1 } } },
  });
  card.forecasts = [{ datetime: '2026-10-21T00:00:00Z', temperature: 10, precipitation: 0.5 }];
  assert.deepEqual(card.computeForecastData({ config: card.config, forecastItems: 1 }).precip, [12.7]);
  assert.equal(card.getPrecipitationAxisMax('mm', true), 4);
  assert.equal(card.getPrecipitationAxisMax('mm', false), 20);
  assert.equal(card.getPrecipitationAxisMax('cm', false), 2);
  assert.equal(card.getPrecipitationAxisMax('in', false), 1);
});

test('#11 pressure converts between every Home Assistant unit', () => {
  const card = makeCard();
  assert.deepEqual(card.formatPressure(1013.25, 'hPa', 'inHg'), { value: '29.92', unit: 'inHg' });
  assert.deepEqual(card.formatPressure(1013.25, 'mbar', 'hPa'), { value: 1013, unit: 'hPa' });
  assert.deepEqual(card.formatPressure(101.325, 'kPa', 'hPa'), { value: 1013, unit: 'hPa' });
  assert.deepEqual(card.formatPressure(14.696, 'psi', 'mmHg'), { value: 760, unit: 'mmHg' });
  assert.deepEqual(card.formatPressure(1013.25, 'hPa', 'kPa'), { value: '101.3', unit: 'kPa' });
  // An unknown unit is shown as reported, labelled with its own unit.
  assert.deepEqual(card.formatPressure(1013.25, 'weird', 'hPa'), { value: 1013, unit: 'weird' });
  assert.deepEqual(card.formatPressure(undefined, 'hPa', 'hPa'), { value: undefined, unit: 'hPa' });
});

test('#16 unknown and unavailable conditions fall back to Home Assistant translations', () => {
  const card = makeCard({ locale: 'en' }, {
    localize: (key) => ({ 'state.default.unavailable': 'Unavailable' })[key] || '',
  });
  assert.equal(card.localizeCondition('rainy'), 'Rainy');
  assert.equal(card.localizeCondition('unavailable'), 'Unavailable');
  assert.equal(card.localizeCondition('unknown'), 'unknown');
});

test('#17 the card is listed in the picker once', () => {
  assert.equal(window.customCards.filter((card) => card.type === 'weather-chart-card-ha').length, 1);
});

test('#14 README option tables list the defaults the card uses', async () => {
  const { readFileSync } = await import('node:fs');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const section = (heading) => readme.split(heading)[1].split('\n### ')[0];
  const tableDefaults = (text) => Object.fromEntries(text.split('\n')
    .filter((line) => /^\| [a-z_0-9]+ *\|/.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .map(([, name, , value]) => [name, value.replace(/^'(.*)'$/, '$1')]));

  const tables = [
    [section('### Card Options'), DEFAULTS],
    [section('### Forecast Options'), FORECAST_DEFAULTS],
    [section('### Units of Measurement'), DEFAULTS.units],
  ];
  for (const [text, defaults] of tables) {
    const documented = tableDefaults(text);
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value === 'object') continue;
      assert.ok(key in documented, `${key} is not documented`);
      assert.equal(documented[key], String(value), `README default for ${key}`);
    }
  }
  assert.ok(!readme.includes('location_name') && !readme.includes('condition_icon_size_multiplier'));
});

test('a single-point temperature gradient has a valid stop offset', () => {
  const card = makeCard();
  const stops = [];
  const ctx = { createLinearGradient: () => ({ addColorStop(offset, color) {
    // CanvasGradient.addColorStop throws on a non-finite offset.
    if (!Number.isFinite(offset) || offset < 0 || offset > 1) throw new RangeError(`bad offset ${offset}`);
    stops.push([offset, color]);
  } }) };
  const area = { left: 0, right: 100 };
  card.createTemperatureGradient([12], '°C', ctx, area);
  assert.deepEqual(stops.map(([offset]) => offset), [0]);
  stops.length = 0;
  card.createTemperatureGradient([12, 15, 18], '°C', ctx, area);
  assert.deepEqual(stops.map(([offset]) => offset), [0, 0.5, 1]);
});
