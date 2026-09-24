import {
  REFUSED_IDENTITIES,
  REFUSED_IDENTITY_NAMES,
} from "src/utils/constants/identity";
import { MAX_IDENTITY_LENGTH } from "src/utils/constants/limits";

export const isRefusedIdentity = (identity: string) =>
  REFUSED_IDENTITIES.includes(identity) ||
  REFUSED_IDENTITY_NAMES.test(identity) ||
  identity.length > MAX_IDENTITY_LENGTH;
