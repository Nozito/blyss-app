import { AuthenticatedRequest } from "./types";

export function parseParamToInt(param: string | string[] | undefined): number {
  if (!param) {
    throw new Error("Paramètre manquant");
  }
  const value = Array.isArray(param) ? param[0] : param;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error("Paramètre invalide");
  }
  return parsed;
}

export function getProId(req: AuthenticatedRequest): number {
  const proId = req.user?.id;
  if (!proId) {
    throw new Error("Pro non authentifié");
  }
  return proId;
}
