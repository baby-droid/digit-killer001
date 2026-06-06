import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { ActiveSymbol, AdminCredentials, AdminSession, AiSignals, AppUser, ChangeAdminPin200, ChangePinInput, DigitAnalysis, EvenOddAnalysis, GetAiSignalsParams, GetDigitAnalysisParams, GetEvenOddAnalysisParams, GetMatchDifferSignalsParams, GetOverUnderSignalsParams, GetTickContractsParams, GetWideEyeAnalysisParams, HealthStatus, MatchDifferSignals, OverUnderSignals, TickContractsAnalysis, UserCredentials, UserInput, UserSession, WideEyeAnalysis } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetActiveSymbolsUrl: () => string;
/**
 * @summary Get all active symbols from Deriv
 */
export declare const getActiveSymbols: (options?: RequestInit) => Promise<ActiveSymbol[]>;
export declare const getGetActiveSymbolsQueryKey: () => readonly ["/api/active-symbols"];
export declare const getGetActiveSymbolsQueryOptions: <TData = Awaited<ReturnType<typeof getActiveSymbols>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getActiveSymbols>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getActiveSymbols>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetActiveSymbolsQueryResult = NonNullable<Awaited<ReturnType<typeof getActiveSymbols>>>;
export type GetActiveSymbolsQueryError = ErrorType<unknown>;
/**
 * @summary Get all active symbols from Deriv
 */
export declare function useGetActiveSymbols<TData = Awaited<ReturnType<typeof getActiveSymbols>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getActiveSymbols>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDigitAnalysisUrl: (params: GetDigitAnalysisParams) => string;
/**
 * @summary Get digit frequency analysis for a symbol
 */
export declare const getDigitAnalysis: (params: GetDigitAnalysisParams, options?: RequestInit) => Promise<DigitAnalysis>;
export declare const getGetDigitAnalysisQueryKey: (params?: GetDigitAnalysisParams) => readonly ["/api/digit-analysis", ...GetDigitAnalysisParams[]];
export declare const getGetDigitAnalysisQueryOptions: <TData = Awaited<ReturnType<typeof getDigitAnalysis>>, TError = ErrorType<unknown>>(params: GetDigitAnalysisParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDigitAnalysis>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDigitAnalysis>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDigitAnalysisQueryResult = NonNullable<Awaited<ReturnType<typeof getDigitAnalysis>>>;
export type GetDigitAnalysisQueryError = ErrorType<unknown>;
/**
 * @summary Get digit frequency analysis for a symbol
 */
export declare function useGetDigitAnalysis<TData = Awaited<ReturnType<typeof getDigitAnalysis>>, TError = ErrorType<unknown>>(params: GetDigitAnalysisParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDigitAnalysis>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetWideEyeAnalysisUrl: (params: GetWideEyeAnalysisParams) => string;
/**
 * @summary Get wide eye D-circles analysis (1000 ticks)
 */
export declare const getWideEyeAnalysis: (params: GetWideEyeAnalysisParams, options?: RequestInit) => Promise<WideEyeAnalysis>;
export declare const getGetWideEyeAnalysisQueryKey: (params?: GetWideEyeAnalysisParams) => readonly ["/api/wide-eye-analysis", ...GetWideEyeAnalysisParams[]];
export declare const getGetWideEyeAnalysisQueryOptions: <TData = Awaited<ReturnType<typeof getWideEyeAnalysis>>, TError = ErrorType<unknown>>(params: GetWideEyeAnalysisParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getWideEyeAnalysis>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getWideEyeAnalysis>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetWideEyeAnalysisQueryResult = NonNullable<Awaited<ReturnType<typeof getWideEyeAnalysis>>>;
export type GetWideEyeAnalysisQueryError = ErrorType<unknown>;
/**
 * @summary Get wide eye D-circles analysis (1000 ticks)
 */
export declare function useGetWideEyeAnalysis<TData = Awaited<ReturnType<typeof getWideEyeAnalysis>>, TError = ErrorType<unknown>>(params: GetWideEyeAnalysisParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getWideEyeAnalysis>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetOverUnderSignalsUrl: (params: GetOverUnderSignalsParams) => string;
/**
 * @summary Get over/under entry signals and recommendations
 */
export declare const getOverUnderSignals: (params: GetOverUnderSignalsParams, options?: RequestInit) => Promise<OverUnderSignals>;
export declare const getGetOverUnderSignalsQueryKey: (params?: GetOverUnderSignalsParams) => readonly ["/api/over-under-signals", ...GetOverUnderSignalsParams[]];
export declare const getGetOverUnderSignalsQueryOptions: <TData = Awaited<ReturnType<typeof getOverUnderSignals>>, TError = ErrorType<unknown>>(params: GetOverUnderSignalsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOverUnderSignals>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getOverUnderSignals>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetOverUnderSignalsQueryResult = NonNullable<Awaited<ReturnType<typeof getOverUnderSignals>>>;
export type GetOverUnderSignalsQueryError = ErrorType<unknown>;
/**
 * @summary Get over/under entry signals and recommendations
 */
export declare function useGetOverUnderSignals<TData = Awaited<ReturnType<typeof getOverUnderSignals>>, TError = ErrorType<unknown>>(params: GetOverUnderSignalsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOverUnderSignals>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetEvenOddAnalysisUrl: (params: GetEvenOddAnalysisParams) => string;
/**
 * @summary Get even/odd digit analysis
 */
export declare const getEvenOddAnalysis: (params: GetEvenOddAnalysisParams, options?: RequestInit) => Promise<EvenOddAnalysis>;
export declare const getGetEvenOddAnalysisQueryKey: (params?: GetEvenOddAnalysisParams) => readonly ["/api/even-odd-analysis", ...GetEvenOddAnalysisParams[]];
export declare const getGetEvenOddAnalysisQueryOptions: <TData = Awaited<ReturnType<typeof getEvenOddAnalysis>>, TError = ErrorType<unknown>>(params: GetEvenOddAnalysisParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEvenOddAnalysis>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getEvenOddAnalysis>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetEvenOddAnalysisQueryResult = NonNullable<Awaited<ReturnType<typeof getEvenOddAnalysis>>>;
export type GetEvenOddAnalysisQueryError = ErrorType<unknown>;
/**
 * @summary Get even/odd digit analysis
 */
export declare function useGetEvenOddAnalysis<TData = Awaited<ReturnType<typeof getEvenOddAnalysis>>, TError = ErrorType<unknown>>(params: GetEvenOddAnalysisParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEvenOddAnalysis>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetMatchDifferSignalsUrl: (params: GetMatchDifferSignalsParams) => string;
/**
 * @summary Get best match/differ digit recommendations
 */
export declare const getMatchDifferSignals: (params: GetMatchDifferSignalsParams, options?: RequestInit) => Promise<MatchDifferSignals>;
export declare const getGetMatchDifferSignalsQueryKey: (params?: GetMatchDifferSignalsParams) => readonly ["/api/match-differ-signals", ...GetMatchDifferSignalsParams[]];
export declare const getGetMatchDifferSignalsQueryOptions: <TData = Awaited<ReturnType<typeof getMatchDifferSignals>>, TError = ErrorType<unknown>>(params: GetMatchDifferSignalsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMatchDifferSignals>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMatchDifferSignals>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMatchDifferSignalsQueryResult = NonNullable<Awaited<ReturnType<typeof getMatchDifferSignals>>>;
export type GetMatchDifferSignalsQueryError = ErrorType<unknown>;
/**
 * @summary Get best match/differ digit recommendations
 */
export declare function useGetMatchDifferSignals<TData = Awaited<ReturnType<typeof getMatchDifferSignals>>, TError = ErrorType<unknown>>(params: GetMatchDifferSignalsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMatchDifferSignals>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetTickContractsUrl: (params: GetTickContractsParams) => string;
/**
 * @summary Get tick contracts analysis (rise/fall, high/low tick, only up/down)
 */
export declare const getTickContracts: (params: GetTickContractsParams, options?: RequestInit) => Promise<TickContractsAnalysis>;
export declare const getGetTickContractsQueryKey: (params?: GetTickContractsParams) => readonly ["/api/tick-contracts", ...GetTickContractsParams[]];
export declare const getGetTickContractsQueryOptions: <TData = Awaited<ReturnType<typeof getTickContracts>>, TError = ErrorType<unknown>>(params: GetTickContractsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTickContracts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTickContracts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTickContractsQueryResult = NonNullable<Awaited<ReturnType<typeof getTickContracts>>>;
export type GetTickContractsQueryError = ErrorType<unknown>;
/**
 * @summary Get tick contracts analysis (rise/fall, high/low tick, only up/down)
 */
export declare function useGetTickContracts<TData = Awaited<ReturnType<typeof getTickContracts>>, TError = ErrorType<unknown>>(params: GetTickContractsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTickContracts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAiSignalsUrl: (params: GetAiSignalsParams) => string;
/**
 * @summary Get AI-generated trading signals
 */
export declare const getAiSignals: (params: GetAiSignalsParams, options?: RequestInit) => Promise<AiSignals>;
export declare const getGetAiSignalsQueryKey: (params?: GetAiSignalsParams) => readonly ["/api/ai-signals", ...GetAiSignalsParams[]];
export declare const getGetAiSignalsQueryOptions: <TData = Awaited<ReturnType<typeof getAiSignals>>, TError = ErrorType<unknown>>(params: GetAiSignalsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAiSignals>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAiSignals>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAiSignalsQueryResult = NonNullable<Awaited<ReturnType<typeof getAiSignals>>>;
export type GetAiSignalsQueryError = ErrorType<unknown>;
/**
 * @summary Get AI-generated trading signals
 */
export declare function useGetAiSignals<TData = Awaited<ReturnType<typeof getAiSignals>>, TError = ErrorType<unknown>>(params: GetAiSignalsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAiSignals>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAdminLoginUrl: () => string;
/**
 * @summary Admin login
 */
export declare const adminLogin: (adminCredentials: AdminCredentials, options?: RequestInit) => Promise<AdminSession>;
export declare const getAdminLoginMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof adminLogin>>, TError, {
        data: BodyType<AdminCredentials>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof adminLogin>>, TError, {
    data: BodyType<AdminCredentials>;
}, TContext>;
export type AdminLoginMutationResult = NonNullable<Awaited<ReturnType<typeof adminLogin>>>;
export type AdminLoginMutationBody = BodyType<AdminCredentials>;
export type AdminLoginMutationError = ErrorType<void>;
/**
* @summary Admin login
*/
export declare const useAdminLogin: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof adminLogin>>, TError, {
        data: BodyType<AdminCredentials>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof adminLogin>>, TError, {
    data: BodyType<AdminCredentials>;
}, TContext>;
export declare const getGetUsersUrl: () => string;
/**
 * @summary List all users
 */
export declare const getUsers: (options?: RequestInit) => Promise<AppUser[]>;
export declare const getGetUsersQueryKey: () => readonly ["/api/admin/users"];
export declare const getGetUsersQueryOptions: <TData = Awaited<ReturnType<typeof getUsers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getUsers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetUsersQueryResult = NonNullable<Awaited<ReturnType<typeof getUsers>>>;
export type GetUsersQueryError = ErrorType<unknown>;
/**
 * @summary List all users
 */
export declare function useGetUsers<TData = Awaited<ReturnType<typeof getUsers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateUserUrl: () => string;
/**
 * @summary Create a new user (generate user ID)
 */
export declare const createUser: (userInput: UserInput, options?: RequestInit) => Promise<AppUser>;
export declare const getCreateUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
        data: BodyType<UserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
    data: BodyType<UserInput>;
}, TContext>;
export type CreateUserMutationResult = NonNullable<Awaited<ReturnType<typeof createUser>>>;
export type CreateUserMutationBody = BodyType<UserInput>;
export type CreateUserMutationError = ErrorType<unknown>;
/**
* @summary Create a new user (generate user ID)
*/
export declare const useCreateUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createUser>>, TError, {
        data: BodyType<UserInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createUser>>, TError, {
    data: BodyType<UserInput>;
}, TContext>;
export declare const getDeleteUserUrl: (id: number) => string;
/**
 * @summary Revoke/delete a user
 */
export declare const deleteUser: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export type DeleteUserMutationResult = NonNullable<Awaited<ReturnType<typeof deleteUser>>>;
export type DeleteUserMutationError = ErrorType<unknown>;
/**
* @summary Revoke/delete a user
*/
export declare const useDeleteUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export declare const getRevokeUserUrl: (id: number) => string;
/**
 * @summary Revoke user access
 */
export declare const revokeUser: (id: number, options?: RequestInit) => Promise<AppUser>;
export declare const getRevokeUserMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof revokeUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof revokeUser>>, TError, {
    id: number;
}, TContext>;
export type RevokeUserMutationResult = NonNullable<Awaited<ReturnType<typeof revokeUser>>>;
export type RevokeUserMutationError = ErrorType<unknown>;
/**
* @summary Revoke user access
*/
export declare const useRevokeUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof revokeUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof revokeUser>>, TError, {
    id: number;
}, TContext>;
export declare const getChangeAdminPinUrl: () => string;
/**
 * @summary Change admin PIN
 */
export declare const changeAdminPin: (changePinInput: ChangePinInput, options?: RequestInit) => Promise<ChangeAdminPin200>;
export declare const getChangeAdminPinMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof changeAdminPin>>, TError, {
        data: BodyType<ChangePinInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof changeAdminPin>>, TError, {
    data: BodyType<ChangePinInput>;
}, TContext>;
export type ChangeAdminPinMutationResult = NonNullable<Awaited<ReturnType<typeof changeAdminPin>>>;
export type ChangeAdminPinMutationBody = BodyType<ChangePinInput>;
export type ChangeAdminPinMutationError = ErrorType<void>;
/**
* @summary Change admin PIN
*/
export declare const useChangeAdminPin: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof changeAdminPin>>, TError, {
        data: BodyType<ChangePinInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof changeAdminPin>>, TError, {
    data: BodyType<ChangePinInput>;
}, TContext>;
export declare const getUserLoginUrl: () => string;
/**
 * @summary User login with generated ID
 */
export declare const userLogin: (userCredentials: UserCredentials, options?: RequestInit) => Promise<UserSession>;
export declare const getUserLoginMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof userLogin>>, TError, {
        data: BodyType<UserCredentials>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof userLogin>>, TError, {
    data: BodyType<UserCredentials>;
}, TContext>;
export type UserLoginMutationResult = NonNullable<Awaited<ReturnType<typeof userLogin>>>;
export type UserLoginMutationBody = BodyType<UserCredentials>;
export type UserLoginMutationError = ErrorType<void>;
/**
* @summary User login with generated ID
*/
export declare const useUserLogin: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof userLogin>>, TError, {
        data: BodyType<UserCredentials>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof userLogin>>, TError, {
    data: BodyType<UserCredentials>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map