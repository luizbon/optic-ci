import { run } from '../src/main';

jest.mock('../src/main');
jest.mock('@useoptic/optic/build/init', () => ({
  initCli: jest.fn()
}));

describe('index', () => {
  it('should call run', () => {
    require('../src/index');
    expect(run).toHaveBeenCalled();
  });
});
