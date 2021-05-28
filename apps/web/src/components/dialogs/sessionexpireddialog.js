import React, { useState } from "react";
import { Flex, Button, Text } from "rebass";
import * as Icon from "../icons";
import Dialog from "./dialog";
import { useStore } from "../../stores/user-store";
import Field from "../field";
import { db } from "../../common/db";
import { showToast } from "../../utils/toast";

const requiredValues = ["email", "password"];
function maskEmail(email) {
  const [username, domain] = email.split("@");
  const maskChars = "*".repeat(
    username.substring(2, username.length - 2).length
  );
  return `${username.substring(0, 2)}${maskChars}${username.substring(
    username.length - 2
  )}@${domain}`;
}

function SessionExpiredDialog(props) {
  const [isLoading, setIsLoading] = useState(false);

  const { onClose, email } = props;
  const [error, setError] = useState();
  const isLoggingIn = useStore((store) => store.isLoggingIn);
  const login = useStore((store) => store.login);

  return (
    <Dialog
      isOpen={true}
      title={"Session expired"}
      description={
        <Flex bg="errorBg" p={1} sx={{ borderRadius: "default" }}>
          <Text as="span" fontSize="body" color="error">
            Please sign in again to continue.{" "}
            <b>If you close the dialog, all your data will be erased.</b>
          </Text>
        </Flex>
      }
      icon={Icon.Login}
      scrollable
      negativeButton={{
        text: "Sign out & erase all data",
        disabled: isLoggingIn,
        onClick: () => {
          if (
            window.confirm(
              "Are you sure you want to sign out and erase all data?"
            )
          ) {
            onClose(false);
          }
        },
      }}
      positiveButton={{
        props: {
          form: "loginForm",
          type: "submit",
        },
        text: "Sign in",
        loading: isLoggingIn || isLoading,
        disabled: isLoggingIn || isLoading,
      }}
    >
      <Flex
        id="loginForm"
        as="form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.target);
          const data = requiredValues.reduce((prev, curr) => {
            prev[curr] = form.get(curr);
            return prev;
          }, {});
          setError();

          if (email) data.email = email;

          login(data, true)
            .then(async () => {
              onClose(true);
            })
            .catch((e) => setError(e.message));
        }}
        flexDirection="column"
      >
        <Field
          required
          id="email"
          label="Email"
          name="email"
          defaultValue={maskEmail(email)}
          disabled={!!email}
          autoComplete="email"
        />
        <Field
          required
          id="password"
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          sx={{ mt: 1 }}
        />
        <Button
          type="button"
          variant="anchor"
          fontSize="body"
          sx={{ alignSelf: "flex-start" }}
          mt={1}
          onClick={() => {
            setError();
            setIsLoading(true);
            db.user
              .recoverAccount(email.toLowerCase())
              .then(() => {
                showToast(
                  "success",
                  "Recovery email sent. Please check your inbox."
                );
                onClose();
              })
              .catch((e) => setError(e.message))
              .finally(() => setIsLoading(false));
          }}
        >
          Forgot password?
        </Button>
        {error && <Text variant="error">{error}</Text>}
      </Flex>
    </Dialog>
  );
}
export default SessionExpiredDialog;