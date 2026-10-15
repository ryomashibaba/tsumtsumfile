import definition from './definition.js';
import { testTsumCommonContract, testChainTsumContract } from '../../tdk/testing.mjs';
testTsumCommonContract(definition);
testChainTsumContract(definition);
