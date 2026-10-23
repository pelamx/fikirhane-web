// Theme by daylight in Istanbul: light from sunrise to sunset, dark at night. A choice made with the theme button
// holds until the next sunrise or sunset, then the site follows the sky again. A classic script loaded in <head>,
// so the page is painted in the right theme from the start.
(function () {
  var LAT = 41.01 * Math.PI / 180, LON = 28.98, KEY = 'fikirhane-theme';

  // Sunrise and sunset of that UTC day, in UTC minutes (NOAA's approximation; a minute or two is plenty here).
  function sun(date) {
    var day = Math.floor((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 864e5);
    var g = 2 * Math.PI / 365 * day;
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
      - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var ha = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(LAT) * Math.cos(decl)) - Math.tan(LAT) * Math.tan(decl)) * 180 / Math.PI;
    return { rise: 720 - 4 * (LON + ha) - eq, set: 720 - 4 * (LON - ha) - eq };
  }

  // The theme the sky asks for now, and which daytime or night it belongs to (a night is named after its evening).
  function sky(date) {
    date = date || new Date();
    var s = sun(date), t = date.getUTCHours() * 60 + date.getUTCMinutes(), light = t >= s.rise && t < s.set;
    var period = new Date(date - (!light && t < s.rise ? 864e5 : 0)).toISOString().slice(0, 10) + (light ? 'd' : 'n');
    return { theme: light ? 'light' : 'dark', period: period };
  }

  function chosen(period) {
    try { var c = JSON.parse(localStorage.getItem(KEY)); return c && c.p === period ? c.t : null; } catch (e) { return null; }
  }

  function current() { var s = sky(); return chosen(s.period) || s.theme; }
  function choose(theme) { try { localStorage.setItem(KEY, JSON.stringify({ t: theme, p: sky().period })); } catch (e) {} }

  window.fikirhaneTheme = { current: current, choose: choose, sky: sky };
  document.documentElement.dataset.theme = current();
})();
