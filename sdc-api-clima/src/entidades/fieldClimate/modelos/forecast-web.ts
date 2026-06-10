export interface IForecastWeb {
  chartsOptions: any[];
  topology: Topology[];
  nofiticaciones: any[];
  grid: Grid;
}

export interface Topology {
  name: string;
  type: string;
  name_custom: string;
  expanded: boolean;
  sensors: Sensor[];
  nodes: any[];
}

export interface Sensor {
  chart: number;
  series: number;
  visible: boolean;
  groupId: string;
  sensor: Sensor2;
}

export interface Sensor2 {
  name: string;
  mac: string;
  serial: string;
  color: string;
}

export interface Grid {
  headers: Header[];
  data: Daum[];
}

export interface Header {
  headerName: string;
  field: string;
  suppressMenu?: boolean;
  pinned?: boolean;
  suppressSorting: boolean;
  sort?: string;
  groupId?: string;
}

export interface Daum {
  datetime: string;
  forecast_temperature: number;
  forecast_precipitation: number;
  forecast_precipitation_probability: number;
  aggr_snowamount: number;
  forecast_windspeed: number;
  forecast_gust: number;
  forecast_winddirection: number;
  forecast_relativehumidity: number;
  aggr_customEto?: number;
  forecast_leafwetnessindex: number;
  forecast_ghi_instant: number;
  forecast_surfaceairpressure: number;
  forecast_totalcloudcover: number;
  forecast_sunshinetime: number;
}
