import { EV } from "../common";
import Constants from "../utils/constants";

export default class User {
  /**
   *
   * @param {import("../api").default} db
   */
  constructor(db) {
    this._db = db;
    this._context = db.context;
  }

  async sync() {
    var user = await this.get();
    if (!user) return;

    if (!user.remember) {
      return this.logout();
    }

    try {
      var serverUser = await authRequest.call(
        this,
        "users",
        undefined,
        true,
        "GET"
      );
    } catch (e) {
      if (e.message.includes("not authorized")) {
        return await this.logout(
          "You were logged out. Either your session expired or your account was deleted. Please try logging in again."
        );
      } else throw e;
    }

    await this.set({
      ...user,
      ...serverUser,
    });

    // propogate event
    EV.publish("user:synced", user);
  }

  get() {
    return this._context.read("user");
  }

  async key() {
    const user = await this.get();
    if (!user) return;
    const key = await this._context.getCryptoKey(`_uk_@${user.username}`);
    return { key, salt: user.salt };
  }

  async set(user) {
    if (!user) return;
    user = { ...(await this.get()), ...user };
    await this._context.write(`user`, user);
  }

  async login(username, password, remember) {
    let response = await authRequest("oauth/token", {
      username,
      password,
      grant_type: "password",
    });
    if (!response) return;
    await this._postLogin(password, remember, response);
  }

  async token() {
    let user = await this.get();
    if (!user) return;
    if (!user.accessToken) {
      return await this._context.remove("user");
    }
    if (user.expiry > Date.now()) {
      return user.accessToken;
    }
    let response = await authRequest("oauth/token", {
      refresh_token: user.refreshToken,
      grant_type: "refresh_token",
    });
    if (!response) return;

    user = {
      ...user,
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiry: Date.now() + response.expiry * 100,
    };
    await this._context.write("user", user);

    // propogate event
    EV.publish("user:tokenRefreshed", user);
  }

  async logout(reason) {
    await this._context.clear();

    // propogate event
    EV.publish("user:loggedOut", reason);
  }

  async signup(username, email, password) {
    let response = await authRequest("auth/register", {
      username,
      password,
      email,
    });
    if (!response) return;
    await this._postLogin(password, true, response);
  }

  async delete() {
    let response = await authRequest.call(
      this,
      "users",
      undefined,
      true,
      "DELETE"
    );
    if (response.success) {
      await this.logout();
      return true;
    }
  }

  async changePassword(oldPassword, newPassword) {
    let response = await authRequest.call(
      this,
      "users/password",
      { old_password: oldPassword, new_password: newPassword },
      true,
      "PATCH"
    );
    if (response.success) {
      await this._db.outbox.add("changePassword", { newPassword }, async () => {
        const key = await this.key();
        const { username } = await this.get();
        await this._context.deriveCryptoKey(`_uk_@${username}`, {
          password: newPassword,
          salt: key.salt,
        });
        await this._db.sync(false, true);
      });
      return true;
    }
  }

  async _postLogin(password, remember, response) {
    await this._context.deriveCryptoKey(`_uk_@${response.payload.username}`, {
      password,
      salt: response.payload.salt,
    });
    let user = userFromResponse(response);
    user.remember = remember;
    await this._context.write("user", user);

    // propogate event
    EV.publish("user:loggedIn", user);
  }
}

function userFromResponse(response) {
  let user = {
    ...response.payload,
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiry: Date.now() + response.expiry * 100,
  };
  return user;
}

async function authRequest(endpoint, data, auth = false, method = "POST") {
  var headers = {};
  if (auth) {
    const token = await this.token();
    headers = {
      Authorization: `Bearer ${token}`,
    };
  }

  let response = await fetch(`${Constants.HOST}/${endpoint}`, {
    method,
    headers: { ...Constants.HEADERS, ...headers },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (response.ok) {
    let result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }
    return result;
  }

  let error =
    (await response.text()) ||
    `Request failed with status code: ${response.status} ${response.statusText}.`;
  throw new Error(error);
}
