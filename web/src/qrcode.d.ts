declare module "qrcode" {
  interface Opciones { margin?: number; width?: number }
  const QRCode: { toDataURL(texto: string, opciones?: Opciones): Promise<string> };
  export default QRCode;
}
