export interface ISocketMessageScope {
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
}

export interface ISocketMessage {
  /**
   * Las entidades modificadas (clientes, usuarios, etc)
   */
  paths?: string[];
  /**
   * Metodo HTTP ejecutado (post, put, delete)
   */
  method?: string;
  /**
   * El id del usuario que ejecutó la accion
   */
  idUser?: string;
  /**
   * Alcance tenant para evitar broadcasts cruzados entre clientes.
   */
  alcance?: ISocketMessageScope;
  /**
   * El body que se devolvio al usuario de la entidad creada/modificada/eliminada
   */
  body?: Record<string, any>;
  /**
   * Por que el usuario recibio el mensaje (para debug mas que nada)
   */
  motivo?: string;
}
