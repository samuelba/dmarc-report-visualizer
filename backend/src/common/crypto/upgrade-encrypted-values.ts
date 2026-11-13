import { VersionedCipher } from './versioned-cipher';

export interface EncryptedValue<Id> {
  readonly id: Id;
  readonly value: string;
}

/**
 * Persist a re-encrypted value only if the stored value is still `oldValue`,
 * so concurrent instances never overwrite each other.
 * @returns true if the row was updated
 */
export type SaveIfUnchanged<Id> = (
  id: Id,
  oldValue: string,
  newValue: string,
) => Promise<boolean>;

export interface UpgradeReport<Id> {
  readonly upgraded: Id[];
  /** `v2:` values while no current key is configured */
  readonly missingKey: Id[];
  /** `v2:` values that the configured current key cannot decrypt */
  readonly unreadableCurrent: Id[];
  /** Legacy values that the legacy key cannot decrypt */
  readonly unreadableLegacy: Id[];
}

type Outcome = Exclude<keyof UpgradeReport<unknown>, 'upgraded'> | 'ok';

function classify(cipher: VersionedCipher, value: string): Outcome {
  const isCurrent = cipher.isCurrentFormat(value);
  if (isCurrent && !cipher.hasCurrentKey) {
    return 'missingKey';
  }
  try {
    cipher.decrypt(value);
    return 'ok';
  } catch {
    return isCurrent ? 'unreadableCurrent' : 'unreadableLegacy';
  }
}

/**
 * Check every stored value against the configured keys and re-encrypt the
 * readable legacy ones with the current key. Each row is upgraded on its own:
 * the format marker makes a partly upgraded table valid.
 */
export async function upgradeEncryptedValues<Id>(
  values: readonly EncryptedValue<Id>[],
  cipher: VersionedCipher,
  save: SaveIfUnchanged<Id>,
): Promise<UpgradeReport<Id>> {
  const report: UpgradeReport<Id> = {
    upgraded: [],
    missingKey: [],
    unreadableCurrent: [],
    unreadableLegacy: [],
  };

  for (const { id, value } of values) {
    const outcome = classify(cipher, value);
    if (outcome !== 'ok') {
      report[outcome].push(id);
      continue;
    }
    if (!cipher.needsUpgrade(value)) {
      continue;
    }
    const upgradedValue = cipher.encrypt(cipher.decrypt(value));
    if (await save(id, value, upgradedValue)) {
      report.upgraded.push(id);
    }
  }

  return report;
}
