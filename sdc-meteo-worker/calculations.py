import math
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
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
    return value - 273.15


def _finite_number(value) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def normalise_precipitation_mm(
    precipitation_m: float, negative_tolerance_mm: float
) -> tuple[float | None, str | None]:
    if not _finite_number(precipitation_m):
        return None, "precipitation_non_finite_quarantined"
    precipitation_mm = precipitation_m * 1000.0
    if precipitation_mm > 1000.0:
        return None, "precipitation_above_physical_limit_quarantined"
    if precipitation_mm >= 0:
        return precipitation_mm, None
    if abs(precipitation_mm) <= negative_tolerance_mm:
        return 0.0, "precipitation_negative_artifact_clamped_to_zero"
    return None, "precipitation_negative_outside_tolerance_quarantined"


def _temperature_c(raw: dict, field: str, flags: list[str]):
    value = raw.get(field)
    if value is None:
        return None
    if not _finite_number(value) or not 150.0 <= value <= 350.0:
        flags.append(f"{field}_outside_valid_kelvin_range_omitted")
        return None
    return _kelvin_to_c(value)


def daily_utc_window(
    hourly_records: list[dict], timezone_name: str
) -> tuple[str, str] | None:
    if not hourly_records:
        return None
    try:
        local_timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        local_timezone = ZoneInfo("UTC")
    local_dates = [
        datetime.fromisoformat(record["timestamp"].replace("Z", "+00:00"))
        .astimezone(local_timezone)
        .date()
        for record in hourly_records
    ]
    first_date = min(local_dates)
    last_date = max(local_dates)
    start = datetime.combine(first_date, time.min, tzinfo=local_timezone).astimezone(
        timezone.utc
    )
    end = datetime.combine(
        last_date + timedelta(days=1), time.min, tzinfo=local_timezone
    ).astimezone(timezone.utc) + timedelta(hours=1)
    # ERA5-Land time-series labels de-accumulated precipitation and radiation
    # at the END of their hourly interval.  Include the first timestamp after
    # the local-day boundary so daily interval totals cover
    # (local midnight, next local midnight] without shifting one hour.
    return (
        start.isoformat().replace("+00:00", "Z"),
        end.isoformat().replace("+00:00", "Z"),
    )


def expected_hours_for_local_date(date_text: str, timezone_name: str) -> int:
    try:
        local_timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        local_timezone = ZoneInfo("UTC")
    local_date = date.fromisoformat(date_text)
    start = datetime.combine(local_date, time.min, tzinfo=local_timezone).astimezone(
        timezone.utc
    )
    end = datetime.combine(
        local_date + timedelta(days=1), time.min, tzinfo=local_timezone
    ).astimezone(timezone.utc)
    return int((end - start).total_seconds() / 3600)


def derive_hourly(
    raw_record: dict,
    calculation_version: str,
    negative_precipitation_tolerance_mm: float = 0.001,
) -> dict:
    raw = raw_record["values"]
    values = {}
    flags = []
    temperature_c = _temperature_c(raw, "temperatureK", flags)
    dew_point_c = _temperature_c(raw, "dewPointK", flags)
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
        if _finite_number(pressure_pa) and 30_000.0 <= pressure_pa <= 120_000.0:
            values["surfacePressureKpa"] = pressure_pa / 1000.0
        else:
            flags.append("surface_pressure_outside_valid_range_omitted")
    u = raw.get("windU10Ms")
    v = raw.get("windV10Ms")
    if (
        _finite_number(u)
        and _finite_number(v)
        and abs(u) <= 150.0
        and abs(v) <= 150.0
    ):
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
    elif u is not None or v is not None:
        flags.append("wind_components_invalid_or_outside_range_omitted")
    precipitation = raw.get("precipitationM")
    if precipitation is not None:
        precipitation_mm, precipitation_flag = normalise_precipitation_mm(
            precipitation, negative_precipitation_tolerance_mm
        )
        if precipitation_mm is not None:
            values["precipitationMm"] = precipitation_mm
        if precipitation_flag:
            flags.append(precipitation_flag)
    shortwave = raw.get("shortwaveRadiationJm2")
    thermal = raw.get("thermalRadiationJm2")
    if _finite_number(shortwave):
        values["shortwaveRadiationMjM2"] = shortwave / 1_000_000.0
    elif shortwave is not None:
        flags.append("shortwave_radiation_non_numeric_omitted")
    if _finite_number(thermal):
        values["thermalRadiationMjM2"] = thermal / 1_000_000.0
    elif thermal is not None:
        flags.append("thermal_radiation_non_numeric_omitted")
    skin_temperature_k = raw.get("skinTemperatureK")
    if _finite_number(skin_temperature_k):
        if 150.0 <= skin_temperature_k <= 350.0:
            values["skinTemperatureC"] = _kelvin_to_c(skin_temperature_k)
        else:
            flags.append("skin_temperature_outside_valid_kelvin_range_omitted")
    snow_cover_fraction = raw.get("snowCoverFraction")
    if _finite_number(snow_cover_fraction):
        if 0.0 <= snow_cover_fraction <= 1.0:
            values["snowCoverPct"] = snow_cover_fraction * 100.0
        else:
            flags.append("snow_cover_outside_valid_range_omitted")
    snow_depth_m = raw.get("snowDepthM")
    if _finite_number(snow_depth_m):
        if snow_depth_m >= 0.0:
            values["snowDepthM"] = snow_depth_m
        else:
            flags.append("snow_depth_negative_omitted")
    soil_temp = raw.get("soilTemperatureK")
    if soil_temp is not None:
        if isinstance(soil_temp, list):
            converted_soil_temperature = []
            if len(soil_temp) != 4:
                flags.append("soil_temperature_layers_invalid_shape")
            for index in range(4):
                value = soil_temp[index] if len(soil_temp) > index else None
                if value is None:
                    converted_soil_temperature.append(None)
                elif _finite_number(value) and 150.0 <= value <= 350.0:
                    converted_soil_temperature.append(_kelvin_to_c(value))
                else:
                    converted_soil_temperature.append(None)
                    flags.append(
                        f"soil_temperature_layer_{index + 1}_outside_valid_kelvin_range_omitted"
                    )
            values["soilTemperatureC"] = converted_soil_temperature
        else:
            flags.append("soil_temperature_layers_invalid_shape_omitted")
    soil_water = raw.get("soilWaterM3M3")
    if soil_water is not None:
        if isinstance(soil_water, list):
            converted_soil_water = []
            if len(soil_water) != 4:
                flags.append("soil_water_layers_invalid_shape")
            for index in range(4):
                value = soil_water[index] if len(soil_water) > index else None
                if _finite_number(value) and 0.0 <= value <= 1.0:
                    converted_soil_water.append(value)
                else:
                    converted_soil_water.append(None)
                    flags.append(
                        f"soil_water_layer_{index + 1}_outside_valid_range_omitted"
                    )
            values["soilWaterM3M3"] = converted_soil_water
        else:
            flags.append("soil_water_layers_invalid_shape_omitted")
    required = (
        temperature_c,
        dew_point_c,
        values.get("surfacePressureKpa"),
        values.get("windSpeed2Ms"),
        values.get("shortwaveRadiationMjM2"),
        values.get("thermalRadiationMjM2"),
    )
    if all(value is not None for value in required):
        radiating_temperature_k = skin_temperature_k
        if not (
            _finite_number(radiating_temperature_k)
            and 150.0 <= radiating_temperature_k <= 350.0
        ):
            radiating_temperature_k = temperature_c + 273.15
            flags.append("net_radiation_skin_temperature_unavailable_air_fallback")
        outgoing_thermal = (
            5.670374419e-8
            * (radiating_temperature_k**4)
            * 3600
            / 1_000_000
        )
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
        flags.append(
            "et0_fao56_net_radiation_estimated_from_downwelling_fluxes"
        )
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


def aggregate_daily(
    hourly_records: list[dict], timezone_name: str, calculation_version: str
) -> list[dict]:
    try:
        local_timezone = ZoneInfo(timezone_name)
        timezone_flag = None
    except ZoneInfoNotFoundError:
        local_timezone = ZoneInfo("UTC")
        timezone_name = "UTC"
        timezone_flag = "timezone_fallback_utc"
    instant_grouped = defaultdict(list)
    interval_grouped = defaultdict(list)
    instants = []
    for record in hourly_records:
        instant = datetime.fromisoformat(record["timestamp"].replace("Z", "+00:00"))
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=timezone.utc)
        instant = instant.astimezone(timezone.utc)
        instants.append(instant)
        instant_date = instant.astimezone(local_timezone).date().isoformat()
        # CDS ERA5-Land time-series de-accumulated values are labelled by the
        # interval END.  A value at local midnight therefore belongs to the
        # previous local day for precipitation, radiation, net radiation and
        # ET0.  Instantaneous fields continue to use the timestamp itself.
        interval_date = (
            instant - timedelta(microseconds=1)
        ).astimezone(local_timezone).date().isoformat()
        instant_grouped[instant_date].append(record)
        interval_grouped[interval_date].append(record)
    if not instants:
        return []
    first_instant_date = min(instants).astimezone(local_timezone).date().isoformat()
    last_interval_date = (
        max(instants) - timedelta(microseconds=1)
    ).astimezone(local_timezone).date().isoformat()
    output_dates = [
        day
        for day in sorted(instant_grouped)
        if first_instant_date <= day <= last_interval_date
    ]
    # Preserve useful behaviour for a single isolated midnight sample while
    # normal worker windows always include a complete interval boundary.
    if not output_dates:
        output_dates = sorted(instant_grouped)
    output = []
    for date in output_dates:
        rows = instant_grouped[date]
        interval_rows = interval_grouped.get(date, [])
        values = {}
        flags = [timezone_flag] if timezone_flag else []
        hours_expected = expected_hours_for_local_date(date, timezone_name)
        temperatures = _numbers(rows, "temperatureC")
        dew_points = _numbers(rows, "dewPointC")
        humidities = _numbers(rows, "relativeHumidityPct")
        pressures = _numbers(rows, "surfacePressureKpa")
        winds_2m = _numbers(rows, "windSpeed2Ms")
        winds_10m = _numbers(rows, "windSpeed10Ms")
        vpds = _numbers(rows, "vpdKpa")
        _put_summary(
            values,
            temperatures,
            "temperatureMinC",
            "temperatureMeanC",
            "temperatureMaxC",
        )
        _put_summary(
            values,
            dew_points,
            "dewPointMinC",
            "dewPointMeanC",
            "dewPointMaxC",
        )
        _put_summary(
            values,
            humidities,
            "relativeHumidityMinPct",
            "relativeHumidityMeanPct",
            "relativeHumidityMaxPct",
        )
        _put_summary(
            values,
            pressures,
            "surfacePressureMinKpa",
            "surfacePressureMeanKpa",
            "surfacePressureMaxKpa",
        )
        if winds_2m:
            wind_2m_mean = sum(winds_2m) / len(winds_2m)
            wind_2m_max = max(winds_2m)
            values.update(
                windSpeed2mMeanMs=wind_2m_mean,
                windSpeed2mMaxMs=wind_2m_max,
                # Legacy aliases retained for existing API and UI consumers.
                windSpeedMeanMs=wind_2m_mean,
                windSpeedMaxMs=wind_2m_max,
            )
        if winds_10m:
            values.update(
                windSpeed10mMeanMs=sum(winds_10m) / len(winds_10m),
                windSpeed10mMaxMs=max(winds_10m),
            )
        wind_direction = _daily_wind_direction(rows)
        if wind_direction is not None:
            direction, resultant_ratio = wind_direction
            if direction is not None:
                values["windDirectionDominantDeg"] = direction
            values["windDirectionResultantRatio"] = resultant_ratio
        _put_summary(
            values,
            vpds,
            "vpdMinKpa",
            "vpdMeanKpa",
            "vpdMaxKpa",
        )
        has_precipitation_outlier = any(
            any(
                flag in row.get("qualityFlags", [])
                for flag in (
                    "precipitation_negative_outside_tolerance_quarantined",
                    "precipitation_above_physical_limit_quarantined",
                )
            )
            for row in interval_rows
        )
        has_precipitation_correction = any(
            "precipitation_negative_artifact_clamped_to_zero"
            in row.get("qualityFlags", [])
            for row in interval_rows
        )
        precipitation = _numbers(interval_rows, "precipitationMm")
        if has_precipitation_outlier:
            flags.append("daily_precipitation_unavailable_negative_outlier")
        elif precipitation:
            values["precipitationMm"] = sum(precipitation)
            values["precipitationMaxHourlyMm"] = max(precipitation)
        if has_precipitation_correction:
            flags.append("daily_contains_precipitation_negative_correction")
        for key, target in (
            ("shortwaveRadiationMjM2", "shortwaveRadiationMjM2"),
            ("thermalRadiationMjM2", "thermalRadiationMjM2"),
            ("netRadiationMjM2", "netRadiationMjM2"),
            ("et0Mm", "et0Mm"),
        ):
            numbers = _numbers(interval_rows, key)
            if numbers:
                values[target] = sum(numbers)
        _put_summary(
            values,
            _numbers(rows, "skinTemperatureC"),
            "skinTemperatureMinC",
            "skinTemperatureMeanC",
            "skinTemperatureMaxC",
        )
        _put_summary(
            values,
            _numbers(rows, "snowCoverPct"),
            "snowCoverMinPct",
            "snowCoverMeanPct",
            "snowCoverMaxPct",
        )
        _put_summary(
            values,
            _numbers(rows, "snowDepthM"),
            "snowDepthMinM",
            "snowDepthMeanM",
            "snowDepthMaxM",
        )
        _put_layer_summaries(
            values,
            rows,
            "soilTemperatureC",
            "soilTemperatureMinC",
            "soilTemperatureMeanC",
            "soilTemperatureMaxC",
        )
        _put_layer_summaries(
            values,
            rows,
            "soilWaterM3M3",
            "soilWaterMinM3M3",
            "soilWaterMeanM3M3",
            "soilWaterMaxM3M3",
        )
        available_hours_by_metric = _available_hours_by_metric(rows, interval_rows)
        flags.extend(
            _metric_incompleteness_flags(
                available_hours_by_metric,
                len(rows),
            )
        )
        if any(
            "snow_cover_outside_valid_range_omitted"
            in row.get("qualityFlags", [])
            for row in rows
        ):
            flags.append("daily_contains_snow_cover_outside_valid_range")
        if any(
            "snow_depth_negative_omitted" in row.get("qualityFlags", [])
            for row in rows
        ):
            flags.append("daily_contains_snow_depth_negative")
        if len(rows) < hours_expected:
            flags.append("daily_incomplete_less_than_expected_hours")
        output.append(
            {
                "gridPointKey": rows[0]["gridPointKey"],
                "date": date,
                "timezone": timezone_name,
                "calculationVersion": calculation_version,
                "hoursAvailable": len(rows),
                "hoursExpected": hours_expected,
                "values": values,
                "availableHoursByMetric": available_hours_by_metric,
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
        if _finite_number(row.get("values", {}).get(key))
    ]


def _layer_numbers(rows: list[dict], key: str, layer: int) -> list[float]:
    numbers = []
    for row in rows:
        layers = row.get("values", {}).get(key)
        if not isinstance(layers, (list, tuple)) or layer >= len(layers):
            continue
        value = layers[layer]
        if _finite_number(value):
            numbers.append(value)
    return numbers


def _put_summary(
    target: dict,
    numbers: list[float],
    minimum_key: str,
    mean_key: str,
    maximum_key: str,
):
    if not numbers:
        return
    target.update(
        {
            minimum_key: min(numbers),
            mean_key: sum(numbers) / len(numbers),
            maximum_key: max(numbers),
        }
    )


def _put_layer_summaries(
    target: dict,
    rows: list[dict],
    source_key: str,
    minimum_key: str,
    mean_key: str,
    maximum_key: str,
):
    layers = [_layer_numbers(rows, source_key, index) for index in range(4)]
    if not any(layers):
        return
    target[minimum_key] = [min(numbers) if numbers else None for numbers in layers]
    target[mean_key] = [
        sum(numbers) / len(numbers) if numbers else None for numbers in layers
    ]
    target[maximum_key] = [max(numbers) if numbers else None for numbers in layers]


def _daily_wind_direction(rows: list[dict]) -> tuple[float | None, float] | None:
    components = []
    for row in rows:
        values = row.get("values", {})
        u = values.get("windU10Ms")
        v = values.get("windV10Ms")
        if _finite_number(u) and _finite_number(v):
            components.append((u, v))
    if not components:
        return None
    mean_u = sum(u for u, _ in components) / len(components)
    mean_v = sum(v for _, v in components) / len(components)
    resultant_speed = math.hypot(mean_u, mean_v)
    mean_speed = sum(math.hypot(u, v) for u, v in components) / len(components)
    ratio = 0.0 if mean_speed <= 1e-12 else resultant_speed / mean_speed
    ratio = min(1.0, max(0.0, ratio))
    direction = None
    if resultant_speed > 1e-12:
        direction = wind_from_components(mean_u, mean_v)[1]
    return direction, ratio


def _available_hours_by_metric(
    rows: list[dict], interval_rows: list[dict] | None = None
) -> dict:
    interval_rows = rows if interval_rows is None else interval_rows
    availability = {
        "temperature": len(_numbers(rows, "temperatureC")),
        "dewPoint": len(_numbers(rows, "dewPointC")),
        "relativeHumidity": len(_numbers(rows, "relativeHumidityPct")),
        "surfacePressure": len(_numbers(rows, "surfacePressureKpa")),
        "wind10m": len(_numbers(rows, "windSpeed10Ms")),
        "wind2m": len(_numbers(rows, "windSpeed2Ms")),
        "windDirection": len(_numbers(rows, "windDirectionDeg")),
        "precipitation": len(_numbers(interval_rows, "precipitationMm")),
        "shortwaveRadiation": len(
            _numbers(interval_rows, "shortwaveRadiationMjM2")
        ),
        "thermalRadiation": len(
            _numbers(interval_rows, "thermalRadiationMjM2")
        ),
        "netRadiation": len(_numbers(interval_rows, "netRadiationMjM2")),
        "vpd": len(_numbers(rows, "vpdKpa")),
        "et0": len(_numbers(interval_rows, "et0Mm")),
        "skinTemperature": len(_numbers(rows, "skinTemperatureC")),
        "snowCover": len(_numbers(rows, "snowCoverPct")),
        "snowDepth": len(_numbers(rows, "snowDepthM")),
        "soilTemperature": [
            len(_layer_numbers(rows, "soilTemperatureC", index))
            for index in range(4)
        ],
        "soilWater": [
            len(_layer_numbers(rows, "soilWaterM3M3", index))
            for index in range(4)
        ],
    }
    return availability


def _metric_incompleteness_flags(
    availability: dict, hours_available: int
) -> list[str]:
    if hours_available <= 0:
        return []
    flags = []
    for metric, count in availability.items():
        metric_slug = _camel_to_snake(metric)
        if isinstance(count, list):
            for index, layer_count in enumerate(count, start=1):
                if layer_count < hours_available:
                    flags.append(
                        f"daily_incomplete_{metric_slug}_layer_{index}_within_available_hours"
                    )
        elif count < hours_available:
            flags.append(
                f"daily_incomplete_{metric_slug}_within_available_hours"
            )
    return flags


def _camel_to_snake(value: str) -> str:
    return "".join(
        f"_{character.lower()}" if character.isupper() else character
        for character in value
    ).lstrip("_")
