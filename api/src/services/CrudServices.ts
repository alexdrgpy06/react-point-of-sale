import { AppDataSource } from '../data-source';
import { InsertResult, UpdateResult, ObjectLiteral, FindOptionsWhere } from 'typeorm';

export interface IFetchPageQuery {
  search: string;
  perPage: number;
  page: number;
}

export class CrudServices<T extends ObjectLiteral> {
  protected classType: new () => T;

  protected alias: string;

  setEntity(classType: new () => T) {
    this.classType = classType;
    this.alias = this.classType.name.toLowerCase();
  }

  public async fetchAll(): Promise<T[]> {
    return AppDataSource.manager.find(this.classType);
  }

  public async fetchPages(query: IFetchPageQuery): Promise<T[]> {
    const recordsToSkip = (query.page - 1) * query.perPage;
    const repository = AppDataSource.getRepository(this.classType);
    let queryBuilder = repository.createQueryBuilder(this.alias);

    if (query.search) {
      queryBuilder = queryBuilder.where(`${this.alias}.id like :id`, { id: `%${query.search}%` });
    }

    return queryBuilder.skip(recordsToSkip).take(query.perPage).getMany();
  }

  public async fetchById(id: string | number): Promise<T | null> {
    const repository = AppDataSource.getRepository(this.classType);
    return repository.findOneBy({ id } as any);
  }

  public async create(userId: string = 'admin', entity: T): Promise<InsertResult> {
    (entity as any).createdBy = userId;
    (entity as any).updatedBy = userId;
    return AppDataSource.manager.insert(this.classType, entity as any);
  }

  public async updateById(
    userId: string = 'admin',
    where: FindOptionsWhere<T>,
    data: Partial<T>
  ): Promise<UpdateResult> {
    try {
      (data as any).updatedBy = userId;
      return AppDataSource.manager.update(this.classType, where, data);
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT' && error.errno === 19) {
        throw {
          code: 'SQLITE_CONSTRAINT',
          message:
            "This record can't be updated since it has references with other parts of data. Please ensure that those are deleted and try this operation",
        };
      }
      throw error;
    }
  }

  public async deleteById(id: string | number): Promise<any> {
    try {
      return AppDataSource.manager.delete(this.classType, id);
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT' && error.errno === 19) {
        throw {
          code: 'SQLITE_CONSTRAINT',
          message:
            "This record can't be deleted since it has references with other parts of data. Please ensure that those are deleted and try this operation",
        };
      }
      throw error;
    }
  }
}
