import { AppDataSource } from '../data-source';
import { User } from '../entity/User';
import { UserLoginPost } from '../dtos/authTypes';

export class AuthServices {
  public async fetchUser(userPost: UserLoginPost): Promise<User | null> {
    const entityManager = AppDataSource.manager;
    const user = await entityManager.findOne(User, {
      where: { id: userPost.userid, password: userPost.password },
    });
    return user;
  }
}
