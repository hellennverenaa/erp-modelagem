import { In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PerfilPermissao } from '../entities/PerfilPermissao';

export async function obterPermissoesGlobais(perfilId: string): Promise<Record<string, boolean>> {
  const rows = await AppDataSource.getRepository(PerfilPermissao).find({
    where: { perfilId, setorId: IsNull() },
    select: { acao: true, permitido: true },
  });

  return Object.fromEntries(rows.map(({ acao, permitido }) => [acao, permitido]));
}

export async function perfilPossuiPermissao(perfilId: string, acao: string): Promise<boolean> {
  const row = await AppDataSource.getRepository(PerfilPermissao).findOne({
    where: { perfilId, setorId: IsNull(), acao, permitido: true },
    select: { id: true },
  });
  return !!row;
}

export async function perfilPossuiAlgumaPermissao(perfilId: string, acoes: string[]): Promise<boolean> {
  if (acoes.length === 0) return false;
  const row = await AppDataSource.getRepository(PerfilPermissao).findOne({
    where: { perfilId, setorId: IsNull(), acao: In(acoes), permitido: true },
    select: { id: true },
  });
  return !!row;
}
