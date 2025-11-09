import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './entity/User';
import { CreditTransactions } from './entity/CreditTransactions';
import { CreditTransactionsPointer } from './entity/CreditTransactionsPointer';
import { Customer } from './entity/Customer';
import { Product } from './entity/Product';
import { TransactionDetails } from './entity/TransactionDetails';
import { TransactionHeader } from './entity/TransactionHeader';
import { TransactionId } from './entity/TransactionId';
import { Expense } from './entity/Expense';
import { ExpenseType } from './entity/ExpenseType';
import { ProductType } from './entity/ProductType';
import { Receiving } from './entity/Receiving';
import { Stock } from './entity/Stock';
import { Vendor } from './entity/Vendor';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite',
  synchronize: true, // NOT for production
  logging: false,
  entities: [
    User,
    CreditTransactions,
    CreditTransactionsPointer,
    Customer,
    Product,
    TransactionDetails,
    TransactionHeader,
    TransactionId,
    Expense,
    ExpenseType,
    ProductType,
    Receiving,
    Stock,
    Vendor,
  ],
  migrations: [],
  subscribers: [],
});
