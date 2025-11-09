import 'reflect-metadata';
import { verify } from 'jsonwebtoken';
import { createExpressServer, useContainer, Action } from 'routing-controllers';
import { Container } from 'typedi';
import { Application } from 'express';
import { config } from './config';
import { Role } from './entity/User';
import { AppDataSource } from './data-source';

async function authorizationChecker(action: Action, roles: Role[]): Promise<boolean> {
  const token = (action.request.headers['authorization'] || '').replace('Bearer ', '');

  if (!token) {
    throw new Error('Invalid token');
  }

  try {
    const decoded = verify(token, config.jwtSecret) as any;
    action.request.token = decoded;

    if (roles.length > 0) {
      const hasRights = roles.some(role => role === decoded.role);
      if (hasRights) {
        return true;
      }
      throw new Error("You don't have rights to do this operation");
    }
    return true;
  } catch (err) {
    throw new Error('Token expired or invalid.');
  }
}

async function createServer(): Promise<void> {
  try {
    await AppDataSource.initialize();
    // eslint-disable-next-line no-console
    console.log('Data Source has been initialized!');

    useContainer(Container);

    const app: Application = createExpressServer({
      authorizationChecker,
      cors: true,
      routePrefix: '/api',
      defaultErrorHandler: false,
      middlewares: [`${__dirname}/middlewares/**/*{.ts,.js}`],
      controllers: [`${__dirname}/controllers/**/*{.ts,.js}`],
    });

    const port = process.env.PORT || 3500;

    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server started at http://localhost:${port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during Data Source initialization:', error);
  }
}

createServer();
