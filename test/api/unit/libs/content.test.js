import fs from 'fs';
import * as contentLib from '../../../../website/server/libs/content';
import content from '../../../../website/common/script/content';
import {
  generateRes,
} from '../../../helpers/api-unit.helper';

describe('contentLib', () => {
  describe('CONTENT_CACHE_PATH', () => {
    it('exports CONTENT_CACHE_PATH', () => {
      expect(contentLib.CONTENT_CACHE_PATH).to.be.a.string;
    });
  });

  describe('getLocalizedContentResponse', () => {
    it('clones, not modify, the original content data', () => {
      contentLib.getLocalizedContentResponse();
      expect(typeof content.backgrounds.backgrounds062014.beach.text).to.equal('function');
    });

    it('removes keys from the content data', () => {
      const response = contentLib.localizeContentData(content, 'en', { backgroundsFlat: true, dropHatchingPotions: true });
      expect(response.backgroundsFlat).to.not.exist;
      expect(response.backgrounds).to.exist;
      expect(response.dropHatchingPotions).to.not.exist;
      expect(response.hatchingPotions).to.exist;
    });

    it('removes nested keys from the content data', () => {
      const response = contentLib.localizeContentData(content, 'en', { gear: { tree: true } });
      expect(response.gear.tree).to.not.exist;
      expect(response.gear.flat).to.exist;
    });
  });

  it('generates a hash for a filter', () => {
    const hash = contentLib.hashForFilter('backgroundsFlat,gear.flat');
    expect(hash).to.equal('-1791877526');
  });

  it('serves content', () => {
    const resSpy = generateRes();
    contentLib.serveContent(resSpy, 'en', '', false);
    expect(resSpy.send).to.have.been.calledOnce;
  });

  it('serves filtered content', () => {
    const resSpy = generateRes();
    contentLib.serveContent(resSpy, 'en', 'backgroundsFlat,gear.flat', false);
    expect(resSpy.send).to.have.been.calledOnce;
  });

  it('ignores a filter that is not a string', () => {
    const resSpy = generateRes();
    contentLib.serveContent(resSpy, 'en', ['backgroundsFlat', 'gear.flat'], false);
    expect(resSpy.send).to.have.been.calledOnce;
  });

  describe('buildFilterObject', () => {
    afterEach(() => {
      delete Object.prototype.userSupport; // eslint-disable-line no-extend-native
      delete Object.prototype.moderator; // eslint-disable-line no-extend-native
    });

    it('builds nested filters', () => {
      const filterObj = contentLib.buildFilterObject('backgroundsFlat,gear.flat');
      expect(filterObj.backgroundsFlat).to.equal(true);
      expect(filterObj.gear.flat).to.equal(true);
    });

    it('does not modify Object.prototype', () => {
      contentLib.buildFilterObject('__proto__.userSupport,constructor.prototype,__proto__.moderator');
      expect({}.userSupport).to.be.undefined;
      expect({}.moderator).to.be.undefined;
    });

    it('works with the content filtering', () => {
      const filterObj = contentLib.buildFilterObject('backgroundsFlat,gear.tree');
      const response = contentLib.localizeContentData(content, 'en', filterObj);
      expect(response.backgroundsFlat).to.not.exist;
      expect(response.gear.tree).to.not.exist;
      expect(response.gear.flat).to.exist;
    });
  });

  describe('caches content', async () => {
    let resSpy;
    beforeEach(() => {
      resSpy = generateRes();
      if (fs.existsSync(contentLib.CONTENT_CACHE_PATH)) {
        fs.rmSync(contentLib.CONTENT_CACHE_PATH, { recursive: true });
      }
      fs.mkdirSync(contentLib.CONTENT_CACHE_PATH);
    });

    it('does not cache requests in development mode', async () => {
      contentLib.serveContent(resSpy, 'en', '', false);
      expect(fs.existsSync(`${contentLib.CONTENT_CACHE_PATH}en.json`)).to.be.false;
    });

    it('caches unfiltered requests', async () => {
      expect(fs.existsSync(`${contentLib.CONTENT_CACHE_PATH}en.json`)).to.be.false;
      contentLib.serveContent(resSpy, 'en', '', true);
      expect(fs.existsSync(`${contentLib.CONTENT_CACHE_PATH}en.json`)).to.be.true;
    });

    it('serves cached requests', async () => {
      fs.writeFileSync(
        `${contentLib.CONTENT_CACHE_PATH}en.json`,
        '{"success": true, "data": {"all": {}}}',
        'utf8',
      );
      contentLib.serveContent(resSpy, 'en', '', true);
      expect(resSpy.sendFile).to.have.been.calledOnce;
      expect(resSpy.sendFile).to.have.been.calledWith(`${contentLib.CONTENT_CACHE_PATH}en.json`);
    });

    it('caches filtered requests', async () => {
      const filter = contentLib.V4_FILTER;
      const hash = contentLib.hashForFilter(filter);
      expect(fs.existsSync(`${contentLib.CONTENT_CACHE_PATH}en${hash}.json`)).to.be.false;
      contentLib.serveContent(resSpy, 'en', filter, true);
      expect(fs.existsSync(`${contentLib.CONTENT_CACHE_PATH}en${hash}.json`)).to.be.true;
    });

    it('does not cache requests with other filters', async () => {
      const filter = 'backgroundsFlat,gear.flat';
      const hash = contentLib.hashForFilter(filter);
      contentLib.serveContent(resSpy, 'en', filter, true);
      expect(fs.existsSync(`${contentLib.CONTENT_CACHE_PATH}en${hash}.json`)).to.be.false;
      expect(resSpy.send).to.have.been.calledOnce;
    });

    it('serves filtered cached requests', async () => {
      const filter = contentLib.V4_FILTER;
      const hash = contentLib.hashForFilter(filter);
      fs.writeFileSync(
        `${contentLib.CONTENT_CACHE_PATH}en${hash}.json`,
        '{"success": true, "data": {}}',
        'utf8',
      );
      contentLib.serveContent(resSpy, 'en', filter, true);
      expect(resSpy.sendFile).to.have.been.calledOnce;
      expect(resSpy.sendFile).to.have.been.calledWith(`${contentLib.CONTENT_CACHE_PATH}en${hash}.json`);
    });
  });
});
