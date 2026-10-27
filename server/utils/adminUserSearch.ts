import type { Prisma } from "#shared/generated/client";
import { personNameWords } from "#shared/utils/adminSearch";
import { escapeLike } from "#shared/utils/searchQuery";

/**
 * Matches a user by email, first or last name. A multi-word term such as
 * "Jane Doe" or "Doe, Jane" also matches when every word is found in the first
 * or last name, since the full name is not stored as one column.
 */
export function userSearchWhere(term: string): Prisma.UserWhereInput {
  const contains = (value: string) => ({
    contains: escapeLike(value),
    mode: "insensitive" as const,
  });

  const clauses: Prisma.UserWhereInput[] = [
    { emailAddress: contains(term) },
    { givenName: contains(term) },
    { familyName: contains(term) },
  ];

  const words = personNameWords(term);
  if (words.length > 1) {
    clauses.push({
      AND: words.map((word) => ({
        OR: [{ givenName: contains(word) }, { familyName: contains(word) }],
      })),
    });
  }

  return { OR: clauses };
}
