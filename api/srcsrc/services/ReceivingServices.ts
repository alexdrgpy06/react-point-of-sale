import { AppDataSource } from '../data-source';
import { CrudServices, IFetchPageQuery } from './CrudServices';
import { Receiving } from '../entity/Receiving';
import { Stock } from '../entity/Stock';

export class ReceivingServices {
  private crudServices: CrudServices<Receiving>;

  constructor() {
    this.crudServices = new CrudServices<Receiving>();
    this.crudServices.setEntity(Receiving);
  }

  public async create(userId: string, receiving: Receiving): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      receiving.createdBy = userId;
      receiving.updatedBy = userId;
      await queryRunner.manager.insert(Receiving, receiving);
      await queryRunner.manager.increment(
        Stock,
        { id: receiving.productId },
        'qty',
        receiving.qty
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  public async fetchPages(query: IFetchPageQuery): Promise<Receiving[]> {
    return this.crudServices.fetchPages(query);
  }

  public async fetchById(id: string | number): Promise<Receiving | null> {
    return this.crudServices.fetchById(id);
  }

  public async deleteById(id: string): Promise<any> {
    return this.crudServices.deleteById(id);
  }

  public async updateById(
    userId: string = 'admin',
    where: object,
    data: any
  ): Promise<any> {
    return this.crudServices.updateById(userId, where, data);
  }
}
