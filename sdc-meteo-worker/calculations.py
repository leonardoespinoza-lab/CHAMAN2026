import math
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def saturation_vapour_pressure_kpa(temperature_c: float) -> float:
    return 0.6108 * math.exp((17.27 * temperature_c) / (temperature_c + 237.3))


def relative_humidity_pct(temperature_c: float, dew_point_c: float) -> float:
    actual = saturation_vapour_pressure_kpa(min(dew_point_c, temperature_c))
    saturated = saturation_vapour_pressure_kpa(temperature_c)
    return min(100.0, max(0.0, 100.0 * actual / saturated))


def wind_from_components(u_ms: float, v_ms: float) -> tuple[float, float]:
    speed = math.sqrt(u_ms * u_ms + v_ms * v_ms)
    direction = (math.degrees(math.atan2(-u_ms, -v_ms)) + 360.0) % 360.0
    return speed, direction


def wind_speed_at_2m(speed_ms: float) -> float:
    return speed_ms * 4.87 / math.log(67.8 * 10.0 - 5.42)


def hourly_et0(
    temperature_c: float,
    dew_point_c: float,
    pressure_kpa: float,
    wind_speed_2m_ms: float,
    net_radiation_mj_m2: float,
) -> float:
    es = saturation_vapour_pressure_kpa(temperature_c)
    ea = saturation_vapour_pressure_kpa(min(dew_point_c, temperature_c))
    delta = 4098.0 * es / ((temperature_c + 237.3) ** 2)
    gamma = 0.000665 * pressure_kpa
    soil_heat_flux = 0.1 * net_radiation_mj_m2 if net_radiation_mj_m2 >= 0 else 0.5 * net_radiation_mj_m2
    numerator = 0.408 * delta * (net_radiation_mj_m2 - soil_heat_flux)
    numerator += gamma * (37.0 / (temperature_c + 273.0)) * wind_speed_2m_ms * (es - ea)
    denominator = delta + gamma * (1.0 + 0.34 * wind_speed_2m_ms)
    return max(0.0, numerator / denominator)


def _kelvin_to_c(value):
    return value - 273.15 if value is not None and value > 150 else value


def derive_hourly(raw_record: dict, calculation_version: str) -> dict:
    raw = raw_record["values"]
    values = {}
    flags = []
    temperature_c = _kelvin_to_c(raw.get("temperatureK"))
    dew_point_c = _kelvin_to_c(raw.get("dewPointK"))
    if temperature_c is not None:
        values["temperatureC"] = temperature_c
    if dew_point_c is not None:
        values["dewPointC"] = dew_point_c
    if temperature_c is not None and dew_point_c is not None:
        values["relativeHumidityPct"] = relative_humidity_pct(
            temperature_c, dew_point_c
        )
        values["vpdKpa"] = max(
            0.0,
            saturation_vapour_pressure_kpa(temperature_c)
            - saturation_vapour_pressure_kpa(min(dew_point_c, temperature_c)),
        )
        flags.append("relative_humidity_derived_from_temperature_dewpoint")
    pressure_pa = raw.get("surfacePressurePa")
    if pressure_pa is not None:
        values["surfacePressureKpa"] = pressure_pa / 1000.0 if pressure_pa > 200 else pressure_pa
    u = raw.get("windU10Ms")
    v = raw.get("windV10Ms")
    if u is not None and v is not None:
        speed, direction = wind_from_components(u, v)
        values.update(
            {
                "windU10Ms": u,
                "windV10Ms": v,
                "windSpeed10Ms": speed,
                "windSpeed2Ms": wind_speed_at_2m(speed),
                "windDirectionDeg": direction,
            }
        )
        flags.append("wind_derived_from_uv_components")
    precipitation = raw.get("precipitationM")
    if precipitation is not None:
        values["precipitationMm"] = precipitation * 1000.0 if abs(precipitation) < 2 else precipitation
    shortwave = raw.get("shortwaveRadiationJm2")
    thermal = raw.get("thermalRadiationJm2")
    if shortwave is not None:
        values["shortwaveRadiationMjM2"] = shortwave / 1_000_000.0 if abs(shortwave) > 100 else shortwave
    if thermal is not None:
        values["thermalRadiationMjM2"] = thermal / 1_000_000.0 if abs(thermal) > 100 else thermal
    soil_temp = raw.get("soilTemperatureK")
    if soil_temp:
        values["soilTemperatureC"] = [
            _kelvin_to_c(value) if value is not None else None for value in soil_temp
        ]
    if raw.get("soilWaterM3M3"):
        values["soilWaterM3M3"] = raw["soilWaterM3M3"]
    required = (
        temperature_c,
        dew_point_c,
        values.get("surfacePressureKpa"),
        values.get("windSpeed2Ms"),
        values.get("shortwaveRadiationMjM2"),
        values.get("thermalRadiationMjM2"),
    )
    if all(value is not None for value in required):
        outgoing_thermal = 5.670374419e-8 * ((temperature_c + 273.15) ** 4) * 3600 / 1_000_000
        net_radiation = (
            0.77 * values["shortwaveRadiationMjM2"]
            + values["thermalRadiationMjM2"]
            - outgoing_thermal
        )
        values["netRadiationMjM2"] = net_radiation
        values["et0Mm"] = hourly_et0(
            temperature_c,
            dew_point_c,
            values["surfacePressureKpa"],
            values["windSpeed2Ms"],
            net_radiation,
        )
        flags.append("et0_fao56_net_radiation_estimated_from_downwelling_fluxes")
    return {
        "gridPointKey": raw_record["gridPointKey"],
        "timestamp": raw_record["timestamp"],
        "calculationVersion": calculation_version,
        "values": values,
        "qualityFlags": flags,
        "calculatedAt": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }


def aggregate_daily(hourly_records: list[dict], timezone_name: str, calculation_version: str) -> list[dict]:
    try:
        local_timezone = ZoneInfo(timezone_name)
        timezone_flag = None
    except ZoneInfoNotFoundError:
        local_timezone = ZoneInfo("UTC")
        timezone_name = "UTC"
        timezone_flag = "timezone_fallback_utc"
    grouped = defaultdict(list)
    for record in hourly_records:
        instant = datetime.fromisoformat(record["timestamp"].replace("Z", "+00:00"))
        grouped[instant.astimezone(local_timezone).date().isoformat()].append(record)
    output = []
    for date, rows in sorted(grouped.items()):
        values = {}
        flags = [timezone_flag] if timezone_flag else []
        temperatures = _numbers(rows, "temperatureC")
        humidities = _numbers(rows, "relativeHumidityPct")
        winds = _numbers(rows, "windSpeed2Ms")
        vpds = _numbers(rows, "vpdKpa")
        if temperatures:
            values.update(
                temperatureMinC=min(temperatures),
                temperatureMeanC=sum(temperatures) / len(temperatures),
                temperatureMaxC=max(temperatures),
            )
        if humidities:
            values.update(
                relativeHumidityMinPct=min(humidities),
                relativeHumidityMeanPct=sum(humidities) / len(humidities),
                relativeHumidityMaxPct=max(humidities),
            )
        if winds:
            values.update(
                windSpeedMeanMs=sum(winds) / len(winds),
                windSpeedMaxMs=max(winds),
            )
        if vpds:
            values["vpdMeanKpa"] = sum(vpds) / len(vpds)
        for key, target in (
            ("precipitationMm", "precipitationMm"),
            ("shortwaveRadiationMjM2", "shortwaveRadiationMjM2"),
            ("et0Mm", "et0Mm"),
        ):
            numbers = _numbers(rows, key)
            if numbers:
                values[target] = sum(numbers)
        if len(rows) < 20:
            flags.append("daily_incomplete_less_than_20_hours")
        output.append(
            {
                "gridPointKey": rows[0]["gridPointKey"],
                "date": date,
                "timezone": timezone_name,
                "calculationVersion": calculation_version,
                "hoursAvailable": len(rows),
                "values": values,
                "qualityFlags": flags,
                "calculatedAt": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
            }
        )
    return output


def _numbers(rows: list[dict], key: str) -> list[float]:
    return [
        row["values"][key]
        for row in rows
        if isinstance(row.get("values", {}).get(key), (int, float))
        and math.isfinite(row["values"][key])
    ]
