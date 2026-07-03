import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { PerfilPermissao } from '../entities/PerfilPermissao';
import { Usuario } from '../entities/Usuario';

export class AdminController {
  /**
   * Lista todos os usuários cadastrados no sistema (com perfil e planta).
   */
  public async getUsuarios(_req: Request, res: Response): Promise<Response> {
    try {
      const userRepo = AppDataSource.getRepository(Usuario);
      const users = await userRepo.find({
        relations: { perfil: true, planta: true },
        order: { nomeCompleto: 'ASC' }
      });
      return res.json(users);
    } catch (error) {
      console.error('[AdminController] Erro ao listar usuários:', error);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  }

  /**
   * Obtém a matriz de permissões para um determinado perfilId.
   */
  public async getPermissoes(req: Request, res: Response): Promise<Response> {
    try {
      const { perfilId } = req.params;
      const permissaoRepo = AppDataSource.getRepository(PerfilPermissao);
      const permissoes = await permissaoRepo.find({
        where: { perfilId: perfilId as string },
        relations: { setor: true }
      });
      return res.json(permissoes);
    } catch (error) {
      console.error('[AdminController] Erro ao buscar permissões:', error);
      return res.status(500).json({ error: 'Erro ao buscar permissões' });
    }
  }

  /**
   * Altera dinamicamente as permissões RBAC de um ou mais perfis (Upsert).
   */
  public async updatePermissoes(req: Request, res: Response): Promise<Response> {
    try {
      const body = req.body;
      const items = Array.isArray(body) ? body : [body];

      const permissaoRepo = AppDataSource.getRepository(PerfilPermissao);
      const savedItems: PerfilPermissao[] = [];

      for (const item of items) {
        const { perfilId, setorId, acao, permitido } = item;

        if (!perfilId || !acao) {
          return res.status(400).json({ error: 'perfilId e acao são obrigatórios em cada item.' });
        }

        // Busca se o registro correspondente já existe
        let perm = await permissaoRepo.findOne({
          where: {
            perfilId,
            setorId: setorId || null,
            acao
          }
        });

        if (perm) {
          perm.permitido = permitido !== undefined ? permitido : true;
          perm = await permissaoRepo.save(perm);
        } else {
          perm = permissaoRepo.create({
            perfilId,
            setorId: setorId || null,
            acao,
            permitido: permitido !== undefined ? permitido : true
          });
          perm = await permissaoRepo.save(perm);
        }

        savedItems.push(perm);
      }

      return res.json(savedItems);
    } catch (error) {
      console.error('[AdminController] Erro ao atualizar permissões:', error);
      return res.status(500).json({ error: 'Erro ao atualizar permissões' });
    }
  }
}
