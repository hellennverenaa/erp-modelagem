import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { PerfilPermissao } from '../entities/PerfilPermissao';
import { Usuario } from '../entities/Usuario';

import { Perfil } from '../entities/Perfil';
import { Setor } from '../entities/Setor';
import { IsNull } from 'typeorm';

export class AdminController {
  /**
   * Lista todos os perfis cadastrados no sistema.
   */
  public async getPerfis(_req: Request, res: Response): Promise<Response> {
    try {
      const perfilRepo = AppDataSource.getRepository(Perfil);
      const perfis = await perfilRepo.find({
        order: { nome: 'ASC' }
      });
      return res.json(perfis);
    } catch (error) {
      console.error('[AdminController] Erro ao listar perfis:', error);
      return res.status(500).json({ error: 'Erro ao listar perfis' });
    }
  }

  /**
   * Lista todos os setores cadastrados no sistema.
   */
  public async getSetores(_req: Request, res: Response): Promise<Response> {
    try {
      const setorRepo = AppDataSource.getRepository(Setor);
      const setores = await setorRepo.find({
        order: { ordemFluxo: 'ASC' }
      });
      return res.json(setores);
    } catch (error) {
      console.error('[AdminController] Erro ao listar setores:', error);
      return res.status(500).json({ error: 'Erro ao listar setores' });
    }
  }

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

        // Normalização defensiva de setorId contra strings inválidas ou serialização incorreta
        const normalizedSetorId = (setorId === 'null' || setorId === 'undefined' || setorId === '' || !setorId)
          ? null
          : setorId;

        // Busca se o registro correspondente já existe
        let perm = await permissaoRepo.findOne({
          where: {
            perfilId,
            setorId: normalizedSetorId ? normalizedSetorId : IsNull(),
            acao
          }
        });

        if (perm) {
          perm.permitido = permitido !== undefined ? permitido : true;
          // Garante a passagem do null primitivo do JavaScript e não do IsNull() do TypeORM ao salvar
          perm.setorId = normalizedSetorId;
          perm = await permissaoRepo.save(perm);
        } else {
          perm = permissaoRepo.create({
            perfilId,
            setorId: normalizedSetorId,
            acao,
            permitido: permitido !== undefined ? permitido : true
          });
          perm = await permissaoRepo.save(perm);
        }

        savedItems.push(perm);
      }

      return res.json(savedItems);
    } catch (error) {
      console.error('[AdminController.updatePermissoes] Erro crítico ao atualizar permissões:', error);
      return res.status(500).json({ error: 'Erro ao atualizar permissões no banco de dados.' });
    }
  }

  /**
   * Altera o perfil associado a um determinado usuário (colaborador).
   */
  public async updateUsuarioPerfil(req: Request, res: Response): Promise<Response> {
    try {
      const id = String(req.params.id);
      const { perfilId } = req.body;

      if (!perfilId) {
        return res.status(400).json({ error: 'perfilId é obrigatório.' });
      }

      const userRepo = AppDataSource.getRepository(Usuario);
      const perfilRepo = AppDataSource.getRepository(Perfil);

      const user = await userRepo.findOne({
        where: { id },
        relations: { perfil: true }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      const novoPerfil = await perfilRepo.findOne({ where: { id: perfilId } });
      if (!novoPerfil) {
        return res.status(404).json({ error: 'Perfil não encontrado.' });
      }

      user.perfil = novoPerfil;
      user.perfilId = novoPerfil.id;
      
      const salvo = await userRepo.save(user);

      return res.json({
        message: 'Perfil do usuário atualizado com sucesso.',
        usuario: salvo
      });
    } catch (error) {
      console.error('[AdminController] Erro ao atualizar perfil do usuário:', error);
      return res.status(500).json({ error: 'Erro ao atualizar perfil do usuário.' });
    }
  }
}
