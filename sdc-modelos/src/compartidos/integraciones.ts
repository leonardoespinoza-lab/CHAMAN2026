export interface IIntegracion {
  prediccion?: 'Enfermedad' | 'Riego';
  tipoIntegracion?: 'INFLUXV1' | 'INFLUXV2' | 'HTTPS' | 'MariaDB'; // SQL / MONGODB
  endpoint?: string; // https://miapi.com
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  credenciales?: IIntegracionInfluxV1 | IIntegracionInfluxV2;
  credenciales2?: { key: string; value: string }[];
  ubicacionCredenciales?: 'Query Params' | 'Headers' | 'Body';
}

export interface IIntegracionInfluxV1 {
  host?: string;
  port?: string;
  protocol?: string;
  username?: string;
  password?: string;
  dbName?: string;
  measurement?: string;
}

export interface IIntegracionInfluxV2 {
  host?: string;
  port?: string;
  protocol?: string;
  token?: string;
  dbName?: string;
  measurement?: string;
  org?: string;
}
