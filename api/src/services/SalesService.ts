import currency from 'currency.js';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { TransactionId } from '../entity/TransactionId';
import { TransactionDetails } from '../entity/TransactionDetails';
import { Product } from '../entity/Product';
import { CheckoutSale, DeleteSale } from '../dtos/sale';
import { Customer } from '../entity/Customer';
import { CreditTransactionsPointer } from '../entity/CreditTransactionsPointer';
import {
  CreditTransactions,
  CreditTransactionsType,
} from '../entity/CreditTransactions';
import {
  TransactionHeader,
  TransactionStatus,
  SalesType,
} from '../entity/TransactionHeader';
import * as Messages from './messages';

export class SalesService {
  public async initTransaction(userId: string = 'admin'): Promise<number> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const id = this.getIdPrefix();
      let returnId: number;

      const transactionIdRepo = queryRunner.manager.getRepository(TransactionId);
      const transactionId = await transactionIdRepo.findOneBy({ id });

      if (transactionId) {
        await transactionIdRepo.increment({ id }, 'count', 1);
        const updatedTransactionId = await transactionIdRepo.findOneBy({ id });
        returnId = Number(`${updatedTransactionId!.id}${updatedTransactionId!.count}`);
      } else {
        const newTransactionId = this.getNewTransactionId(userId);
        await transactionIdRepo.insert(newTransactionId);
        returnId = Number(`${id}1`);
      }

      const transactionHeader = this.getnewTransHeader(returnId, userId);
      await queryRunner.manager.getRepository(TransactionHeader).insert(transactionHeader);

      await queryRunner.commitTransaction();
      return returnId;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  public async openTransaction(
    userId: string = 'admin',
    transactionId: number
  ): Promise<number> {
    const transactionHeader = await this.fetchFinishedTransactionHeader(transactionId);
    if (!transactionHeader) {
      throw Messages.TRANSACTION_ID_NOT_FOUND;
    }
    transactionHeader.transactionStatus = TransactionStatus.Pending;
    transactionHeader.updatedBy = userId;
    await AppDataSource.manager.save(transactionHeader);
    return transactionId;
  }

  public async updateCart(
    cartItem: TransactionDetails,
    userId: string = 'admin'
  ): Promise<any> {
    const transactionHeader = await this.fetchInProcessTransactionHeader(cartItem.id);
    if (!transactionHeader) {
      throw Messages.TRANSACTION_ID_NOT_FOUND;
    }

    const product = await AppDataSource.manager.findOne(Product, {
      where: { id: cartItem.productId },
    });
    if (!product) {
      throw new Error('Product not found');
    }

    const isValidPrice =
      currency(product.sellingPrice || 0)
        .multiply(cartItem.qty)
        .subtract(cartItem.discount).value === cartItem.price;
    if (!isValidPrice) {
      throw Messages.INVALID_PRICE;
    }

    cartItem.sellingPrice = currency(product.sellingPrice || 0).multiply(cartItem.qty).value;
    cartItem.costPrice = currency(product.costPrice || 0).multiply(cartItem.qty).value;
    cartItem.createdBy = userId;
    cartItem.updatedBy = userId;
    await AppDataSource.manager.save(cartItem);

    transactionHeader.transactionStatus = TransactionStatus.Pending;
    await AppDataSource.manager.save(transactionHeader);
    return Messages.ADDED_TO_CART;
  }

  public async removeItemFromCart(id: number, productId: string) {
    const transactionHeader = await this.fetchInProcessTransactionHeader(id);
    if (!transactionHeader) {
      throw Messages.TRANSACTION_ID_NOT_FOUND;
    }
    return AppDataSource.manager.delete(TransactionDetails, { id, productId });
  }

  public async emptyCart(transactionId: number): Promise<any> {
    const transactionHeader = await this.fetchInProcessTransactionHeader(transactionId);
    if (!transactionHeader) {
      throw Messages.TRANSACTION_ID_NOT_FOUND;
    }
    await AppDataSource.createQueryBuilder()
      .delete()
      .from(TransactionDetails)
      .where('id = :id', { id: transactionId })
      .execute();
    return Messages.CART_EMPTIED;
  }

  public async deleteSale(
    userId: string = 'admin',
    saleDetails: DeleteSale
  ): Promise<any> {
    const transactionHeader = await this.fetchFinishedTransactionHeader(
      saleDetails.transactionId
    );
    if (!transactionHeader) {
      throw Messages.TRANSACTION_ID_NOT_FOUND;
    }
    if (transactionHeader.salesType === SalesType.CounterSale) {
      return this.deleteCounterSale(saleDetails.transactionId);
    }
    return this.deleteCreditSale(userId, saleDetails);
  }

  public async checkoutSale(
    userId: string = 'admin',
    saleDetails: CheckoutSale,
    isCreditSale: boolean = false
  ): Promise<any> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (isCreditSale) {
        saleDetails.saleType = SalesType.CreditSale;
        await this.saveCreditSale(queryRunner.manager, userId, saleDetails);
      } else {
        saleDetails.saleType = SalesType.CounterSale;
        await this.saveSale(queryRunner.manager, userId, saleDetails);
      }
      await queryRunner.commitTransaction();
      return Messages.SALE_COMPLETED_SUCCESS;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async deleteCreditSale(
    userId: string,
    saleDetails: DeleteSale
  ): Promise<any> {
    const { transactionId, amountPaid, customerId } = saleDetails;
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const transactionHeader = await this.fetchFinishedTransactionHeader(transactionId);
      if (!transactionHeader) {
        throw Messages.TRANSACTION_ID_NOT_FOUND;
      }

      const previousTransaction = await queryRunner.manager.findOne(CreditTransactions, {
        where: { customerId, transactionId, isReverted: false },
      });

      const pointer = await queryRunner.manager.findOne(CreditTransactionsPointer, {
        where: { customerId },
      });

      if (!previousTransaction || !pointer) {
        throw Messages.NO_DATA_FOUND;
      }
      await this.verifyTheBalanceIsLatest(queryRunner.manager, pointer);

      const current = new CreditTransactions();
      current.customerId = saleDetails.customerId || '';
      current.amountPaid = previousTransaction.billAmount || 0;
      current.balance = 0;
      current.billAmount = previousTransaction.billAmount || 0;
      current.transactionId = previousTransaction.transactionId;
      current.totalDebt = currency(pointer.balanceAmount || 0)
        .subtract(currency(previousTransaction.billAmount || 0))
        .add(amountPaid || 0).value;
      current.isReverted = false;
      current.paidDate = new Date();
      current.type = CreditTransactionsType.SaleRevertPayment;
      current.createdBy = userId;
      current.updatedBy = userId;
      const res = await queryRunner.manager.save(current);

      pointer.seqPointer = res.id;
      pointer.updatedBy = userId;
      pointer.balanceAmount = current.totalDebt;
      await queryRunner.manager.save(pointer);

      previousTransaction.isReverted = true;
      previousTransaction.updatedBy = userId;
      await queryRunner.manager.save(previousTransaction);

      transactionHeader.isActive = false;
      await queryRunner.manager.save(transactionHeader);

      await queryRunner.commitTransaction();
      return Messages.SALE_DELETED;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async deleteCounterSale(id: number): Promise<any> {
    await AppDataSource.createQueryBuilder()
      .delete()
      .from(TransactionDetails)
      .where('id = :id', { id })
      .execute();
    return Messages.SALE_DELETED;
  }

  private async saveCreditSale(
    manager: EntityManager,
    userId: string,
    saleDetails: CheckoutSale
  ): Promise<any> {
    const count = await manager.count(Customer, { where: { id: saleDetails.customerId } });
    if (count !== 1) {
      throw Messages.INVALID_CUSTOMER;
    }
    const { billAmount, amountPaid } = await this.saveSale(manager, userId, saleDetails);
    const currentBalance = currency(billAmount || 0).subtract(amountPaid || 0).value;
    const currentTransaction = new CreditTransactions();
    currentTransaction.customerId = saleDetails.customerId || '';
    currentTransaction.amountPaid = amountPaid || 0;
    currentTransaction.billAmount = billAmount || 0;
    currentTransaction.isReverted = false;
    currentTransaction.type = CreditTransactionsType.Sale;
    currentTransaction.paidDate = new Date();
    currentTransaction.createdBy = userId;
    currentTransaction.updatedBy = userId;
    currentTransaction.transactionId = saleDetails.transactionId;
    currentTransaction.balance = currentBalance;
    const previousTransaction = await manager.findOne(CreditTransactions, {
      where: {
        customerId: saleDetails.customerId,
        transactionId: saleDetails.transactionId,
        isReverted: false,
      },
    });
    let pointer = await manager.findOne(CreditTransactionsPointer, {
      where: { customerId: saleDetails.customerId },
    });
    await this.verifyTheBalanceIsLatest(manager, pointer);
    if (!pointer && !previousTransaction) {
      currentTransaction.totalDebt = currentBalance;
    }
    if (pointer && !previousTransaction) {
      currentTransaction.totalDebt = currentBalance + (pointer.balanceAmount || 0);
    }
    if (pointer && previousTransaction) {
      const previousBalance = await this.revertThePreviousCreditTransaction(
        manager,
        previousTransaction,
        pointer.balanceAmount || 0,
        userId
      );
      currentTransaction.totalDebt = currentBalance + previousBalance;
      previousTransaction.isReverted = true;
      await manager.save(CreditTransactions, previousTransaction);
    }
    const res = await manager.save(CreditTransactions, currentTransaction);
    if (!pointer) {
      pointer = new CreditTransactionsPointer();
      pointer.createdBy = userId;
      pointer.customerId = saleDetails.customerId || '';
    }
    pointer.balanceAmount = currentTransaction.totalDebt;
    pointer.seqPointer = res.id;
    pointer.updatedBy = userId;
    await manager.save(CreditTransactionsPointer, pointer);
  }

  private async revertThePreviousCreditTransaction(
    manager: EntityManager,
    previousCreditTransaction: CreditTransactions,
    currentDebt: number,
    userId: string
  ): Promise<number> {
    const ct = new CreditTransactions();
    ct.customerId = previousCreditTransaction.customerId;
    ct.amountPaid = currency(previousCreditTransaction.billAmount || 0).subtract(
      previousCreditTransaction.amountPaid || 0
    ).value;
    ct.balance = 0;
    ct.totalDebt = currency(currentDebt).subtract(ct.amountPaid).value;
    ct.createdBy = userId;
    ct.updatedBy = userId;
    ct.isReverted = true;
    ct.type = CreditTransactionsType.SaleRevertPayment;
    ct.paidDate = new Date();
    await manager.save(CreditTransactions, ct);
    return ct.totalDebt;
  }

  private async verifyTheBalanceIsLatest(
    manager: EntityManager,
    pointer?: CreditTransactionsPointer | null
  ): Promise<boolean> {
    if (!pointer) {
      return true;
    }
    const count = await manager
      .createQueryBuilder(CreditTransactions, 'ct')
      .where('ct.id >= :id', { id: pointer.seqPointer })
      .getCount();
    if (count !== 1) {
      throw Messages.BALANCE_MISMATCH;
    }
    return true;
  }

  private async saveSale(
    manager: EntityManager,
    userId: string,
    saleDetails: CheckoutSale
  ): Promise<TransactionHeader> {
    const transactionHeader = await this.fetchInProcessTransactionHeader(
      saleDetails.transactionId
    );
    if (!transactionHeader) {
      throw Messages.TRANSACTION_ID_NOT_FOUND;
    }
    const { totalPrice, totalDiscount, netTotalPrice } = await manager
      .createQueryBuilder(TransactionDetails, 'td')
      .select('SUM(td.price)', 'totalPrice')
      .addSelect('SUM(td.sellingPrice)', 'netTotalPrice')
      .addSelect('SUM(td.discount)', 'totalDiscount')
      .where('td.id = :id', { id: saleDetails.transactionId })
      .getRawOne();
    transactionHeader.transactionStatus = TransactionStatus.Done;
    transactionHeader.taxPercentageString = saleDetails.taxPercentageString;
    transactionHeader.tax = saleDetails.tax;
    transactionHeader.discountOnTotal = currency(saleDetails.totalDiscount || 0).value;
    transactionHeader.discountOnItems = currency(totalDiscount || 0).value;
    transactionHeader.netAmount = currency(netTotalPrice || 0).value;
    transactionHeader.billAmount = currency(totalPrice || 0)
      .add(saleDetails.tax || 0)
      .subtract(saleDetails.totalDiscount || 0).value;
    transactionHeader.amountPaid = currency(saleDetails.amountPaid || 0).value;
    transactionHeader.updatedBy = userId;
    transactionHeader.salesType = saleDetails.saleType;
    return manager.save(transactionHeader);
  }

  private async fetchInProcessTransactionHeader(
    cartItemId: number
  ): Promise<TransactionHeader | null> {
    return AppDataSource.createQueryBuilder(TransactionHeader, 'th')
      .where('th.id = :id AND th.isActive = 1 AND th.transactionStatus NOT IN (2)', {
        id: cartItemId,
      })
      .getOne();
  }

  private async fetchFinishedTransactionHeader(
    cartItemId: number
  ): Promise<TransactionHeader | null> {
    return AppDataSource.createQueryBuilder(TransactionHeader, 'th')
      .where('th.id = :id AND th.isActive = 1 AND th.transactionStatus IN (:...status)', {
        id: cartItemId,
        status: [TransactionStatus.Done],
      })
      .getOne();
  }

  private getnewTransHeader(
    id: number,
    userId: string,
    salesType: SalesType = SalesType.CounterSale
  ): TransactionHeader {
    const transactionHeader = new TransactionHeader();
    transactionHeader.id = id;
    transactionHeader.billAmount = 0;
    transactionHeader.discountOnItems = 0;
    transactionHeader.discountOnTotal = 0;
    transactionHeader.netAmount = 0;
    transactionHeader.amountPaid = 0;
    transactionHeader.tax = 0;
    transactionHeader.taxPercentageString = '';
    transactionHeader.salesType = salesType;
    transactionHeader.transactionStatus = TransactionStatus.Init;
    transactionHeader.createdBy = userId;
    transactionHeader.updatedBy = userId;
    transactionHeader.isActive = true;
    return transactionHeader;
  }

  private getNewTransactionId(userId: string): TransactionId {
    const id = this.getIdPrefix();
    const transactionId = new TransactionId();
    transactionId.id = id;
    transactionId.count = 1;
    transactionId.createdBy = userId;
    transactionId.updatedBy = userId;
    return transactionId;
  }

  private getIdPrefix(): string {
    const date = new Date();
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${year}${month}${day}`;
  }
}
