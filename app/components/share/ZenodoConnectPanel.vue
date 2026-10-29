<script setup lang="ts">
import ZenodoAccountStatus from "~/components/share/ZenodoAccountStatus.vue";
import type { useZenodoReleaseConnection } from "~/composables/useZenodoReleaseConnection";

export type ZenodoReleaseConnection = ReturnType<
  typeof useZenodoReleaseConnection
>;

const props = defineProps<{
  zenodo: ZenodoReleaseConnection;
}>();

const {
  zenodoSignInTab,
  zenodoPersonalToken,
  zenodoSignInTabs,
  zenodoSignInMethod,
  zenodoLoginUrl,
  zenodoTokenSignIn,
  zenodoPersonalTokenExpired,
  zenodoOAuthPausedMessage,
  zenodoNewTokenUrl,
  zenodoTokenError,
  zenodoTokenConnecting,
  zenodoTokensUrl,
  maintenanceMessageFor,
  handleZenodoSignIn,
  handleZenodoTokenConnect,
  zenodoLoading,
  zenodoConfigError,
  zenodoUnavailableMessage,
  zenodoTokenExists,
  zenodoAccount,
  zenodoDisconnecting,
  zenodoPersonalTokenExpiresAtLabel,
  handleZenodoDisconnect,
} = props.zenodo;
</script>

<template>
  <UiSpinner v-if="zenodoLoading" class="py-8" />

  <UAlert
    v-else-if="zenodoConfigError"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-x"
    title="Zenodo publishing isn't available right now"
    :description="
      zenodoUnavailableMessage ||
      'Please try again later, or download your files instead.'
    "
  />

  <template v-else-if="!zenodoTokenExists">
    <template v-if="zenodoSignInMethod">
      <p class="mb-4 text-sm">
        If you don't have a Zenodo account already, please create one first at
        <ULink
          to="https://zenodo.org"
          target="_blank"
          class="text-primary underline"
        >
          zenodo.org</ULink
        >
        before continuing.
      </p>

      <p class="mb-5 text-sm">
        To archive your poster on Zenodo, you will first need to connect your
        Zenodo account with Posters.science
        {{
          zenodoLoginUrl && zenodoTokenSignIn
            ? "using one of the two options below:"
            : "using the option below:"
        }}
      </p>
    </template>

    <UTabs
      v-if="zenodoLoginUrl && zenodoTokenSignIn"
      v-model="zenodoSignInTab"
      :items="zenodoSignInTabs"
      :content="false"
      class="mb-5 w-full"
    />

    <template v-if="zenodoSignInMethod === 'oauth'">
      <h4 class="mb-4 text-sm font-semibold">
        Connect your Zenodo account with your email and password
      </h4>

      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        class="mb-5"
        title="Zenodo sign-in with email and password may require more than one attempt and may fail completely"
      >
        <template #description>
          There is a known issue where Zenodo authentication with your email and
          password (OAuth) can fail. We have reported this to the Zenodo team
          through this
          <ULink
            to="https://github.com/zenodo/zenodo-rdm/issues/1484"
            target="_blank"
            class="text-primary underline"
            >GitHub issue</ULink
          >.{{
            zenodoTokenSignIn
              ? " In the meantime, we highly recommend using the option to sign in with a personal access token."
              : ""
          }}
        </template>
      </UAlert>

      <UButton color="primary" size="lg" @click="handleZenodoSignIn">
        Sign in to Zenodo
      </UButton>
    </template>

    <div v-else-if="zenodoSignInMethod === 'token'">
      <h4 class="mb-4 text-sm font-semibold">
        Connect your Zenodo account with a personal access token
      </h4>

      <UAlert
        v-if="zenodoPersonalTokenExpired"
        color="warning"
        variant="soft"
        icon="i-lucide-clock"
        class="mb-4"
        title="Your personal access token was deleted"
        description="We delete personal access tokens from Posters.science one hour after they are connected. Create a new token on Zenodo and connect again to continue."
      />

      <p v-if="zenodoOAuthPausedMessage" class="mb-4 text-sm">
        {{ zenodoOAuthPausedMessage }}
      </p>

      <ol class="mb-5 list-inside list-decimal space-y-2 text-sm">
        <li>Sign in to your Zenodo account.</li>

        <li>
          Open the
          <ULink
            :to="zenodoNewTokenUrl"
            target="_blank"
            class="text-primary underline"
            >new personal access token page</ULink
          >
          (Account settings, then Applications, then New token).
        </li>

        <li>
          Give it a name like <strong>Posters.science</strong>
          and tick both
          <strong>deposit:write</strong>
          and
          <strong>deposit:actions</strong>. You can leave user:email unticked.
        </li>

        <li>
          Click <strong>Create</strong>, then copy the token and paste it below.
          Zenodo only shows it once.
        </li>
      </ol>

      <form class="mb-5" @submit.prevent="handleZenodoTokenConnect">
        <UFormField
          label="Personal access token"
          name="zenodoPersonalToken"
          :error="zenodoTokenError || false"
        >
          <div class="flex flex-col gap-3 sm:flex-row">
            <UInput
              v-model="zenodoPersonalToken"
              type="password"
              autocomplete="off"
              spellcheck="false"
              data-1p-ignore
              data-lpignore="true"
              placeholder="Paste your token"
              class="w-full sm:max-w-md"
              :disabled="zenodoTokenConnecting"
            />

            <UButton
              type="submit"
              color="primary"
              :loading="zenodoTokenConnecting"
              :disabled="!zenodoPersonalToken.trim()"
            >
              Connect to Zenodo
            </UButton>
          </div>
        </UFormField>
      </form>

      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-clock"
        title="We keep your token for one hour at most"
      >
        <template #description>
          We check the token with Zenodo, store it encrypted and only use it to
          publish the posters you choose. We delete it from Posters.science one
          hour after you connect or sooner if you disconnect. The token stays
          active on Zenodo until you delete it there. To delete it, open
          <ULink
            :to="zenodoTokensUrl"
            target="_blank"
            class="text-primary underline"
            >Applications in your Zenodo account settings</ULink
          >, select the token under Personal access tokens and click Delete.
        </template>
      </UAlert>
    </div>

    <UAlert
      v-else
      color="warning"
      variant="subtle"
      icon="material-symbols:build"
      title="Connecting to Zenodo is paused"
      :description="
        maintenanceMessageFor('zenodoToken') ||
        'Please try again later, or download your files instead.'
      "
    />
  </template>

  <template v-else>
    <ZenodoAccountStatus
      class="mb-4"
      :account="zenodoAccount"
      :disconnecting="zenodoDisconnecting"
      @disconnect="handleZenodoDisconnect"
    />

    <p v-if="zenodoPersonalTokenExpiresAtLabel" class="text-muted mb-4 text-xs">
      Connected with a personal access token. We will delete it from
      Posters.science at {{ zenodoPersonalTokenExpiresAtLabel }}. You can also
      delete it on Zenodo under Applications in your account settings.
    </p>

    <slot />
  </template>
</template>
