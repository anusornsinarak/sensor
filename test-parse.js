const res = '{"latitude":14.024605,"longitude":101.36406,"current_units":{"temperature_2m":"°C","relative_humidity_2m":"%"},"current":{"time":"2026-08-14T19:00","interval":900,"temperature_2m":25.9,"relative_humidity_2m":99,"weather_code":3}}';

let outTemp = 0, outHumi = 0, outCondition = "";
const curIdx = res.indexOf('"current":{');
if (curIdx > 0) {
  const curStr = res.substring(curIdx);
  const tIdx = curStr.indexOf('"temperature_2m":');
  if (tIdx > 0) {
    const tEnd = curStr.indexOf(',', tIdx);
    outTemp = parseFloat(curStr.substring(tIdx + 17, tEnd));
  }
  const hIdx = curStr.indexOf('"relative_humidity_2m":');
  if (hIdx > 0) {
    const hEnd = curStr.indexOf(',', hIdx);
    outHumi = parseFloat(curStr.substring(hIdx + 23, hEnd));
  }
  const wIdx = curStr.indexOf('"weather_code":');
  if (wIdx > 0) {
    const wEnd = curStr.indexOf('}', wIdx);
    const wCode = parseInt(curStr.substring(wIdx + 15, wEnd));
    if (wCode === 0) outCondition = "Clear Sky";
    else if (wCode <= 3) outCondition = "Partly Cloudy";
    else if (wCode <= 48) outCondition = "Foggy";
    else if (wCode <= 82) outCondition = "Rainy";
    else outCondition = "Thunderstorm";
  }
}

console.log({ outTemp, outHumi, outCondition });
